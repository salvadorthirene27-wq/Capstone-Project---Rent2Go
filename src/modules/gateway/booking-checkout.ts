import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {transaction} from '../../lib/db';
import {uuid,versionSchema} from '../../lib/http';
import {digest} from '../cart/pricing';
import {DomainError,type Actor} from '../partners/workflow';
import {financialContext,financialLines,lockFinancialAuthority} from '../bookings/finance-context';
import {assertFinancialOpen} from '../bookings/finance-guard';
import {assertNoPendingCancellation} from '../bookings/cancellation-guard';
import {checkoutPayload,payMongoConfig} from './paymongo';

export const prepareCheckoutCommand=z.object({version:versionSchema,idempotencyKey:uuid,agreementId:uuid,digest:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const fingerprint=(secret:string)=>createHash('sha256').update(secret).digest('hex');
function prepared(row:any){
  return {id:row.id as string,requestId:row.request_id as string,quoteId:row.quote_id as string,agreementId:row.agreement_id as string,mode:row.mode as 'test'|'live',amountCentavos:Number(row.amount_centavos),status:'PREPARED' as const};
}

/** Internal preparation stage only. No route or UI enables this yet. Dispatch,
 * provider receipt posting, custody/refunds and lifecycle gates must be completed
 * together before replacing the currently published payment controls. */
export async function prepareBookingCheckout(actor:Actor,id:string,value:unknown){
  const command=prepareCheckoutCommand.parse(value),config=payMongoConfig(),merchant=fingerprint(config.secretKey);
  const hash=digest({channel:'PAYMONGO_BOOKING',command,mode:config.mode,merchant});
  try{return await transaction(async c=>{
    const ctx=await financialContext(c,actor,id,true);
    if(!ctx.owner)throw new DomainError('Only the booking renter may prepare online checkout.',403);
    const quote=(await c.query('SELECT id,digest,public_snapshot FROM booking_quotation WHERE request_id=$1 ORDER BY revision DESC LIMIT 1',[id])).rows[0];
    await lockFinancialAuthority(c,ctx,false,quote?await financialLines(c,quote.id):[]);
    // Current source access is checked even for a completed retry. Never infer
    // permission from a previously valid checkout or a caller-supplied role.
    const old=(await c.query('SELECT * FROM paymongo_checkout WHERE request_id=$1 AND created_by=$2 AND idempotency_key=$3',[id,ctx.user.id,command.idempotencyKey])).rows[0];
    if(old){if(old.command_digest!==hash)throw new DomainError('This retry key belongs to a different checkout.',409);return prepared(old);}
    await assertFinancialOpen(c,id);await assertNoPendingCancellation(c,id);
    if(ctx.r.version!==command.version)throw new DomainError('This booking changed. Refresh before paying.',409);
    if(!quote||!['AGREEMENT_SIGNED','PAYMENT_PARTIAL'].includes(ctx.r.status))throw new DomainError('Review and sign the current booking agreement first.',409);
    const agreement=(await c.query(`SELECT g.id,g.digest,g.quote_digest,s.agreement_digest,s.signer_id,EXISTS(SELECT 1 FROM booking_agreement_event e WHERE e.agreement_id=g.id AND e.action='WITHDRAWN') withdrawn FROM booking_agreement g
      LEFT JOIN booking_agreement_signature s ON s.agreement_id=g.id
      WHERE g.request_id=$1 AND g.quote_id=$2
      ORDER BY g.revision DESC LIMIT 1`,[id,quote.id])).rows[0];
    if(!agreement||agreement.withdrawn||agreement.signer_id!==ctx.r.renter_id||agreement.id!==command.agreementId||agreement.digest!==command.digest||agreement.quote_digest!==quote.digest||agreement.agreement_digest!==agreement.digest)throw new DomainError('Review the exact signed agreement before paying.',409);
    if(!(await c.query("SELECT 1 FROM booking_quotation_decision WHERE quote_id=$1 AND action='ACCEPTED'",[quote.id])).rowCount)throw new DomainError('The quotation must be accepted first.',409);
    const hold=(await c.query('SELECT id,released_at,expires_at>clock_timestamp() AS live FROM booking_hold WHERE quote_id=$1 FOR UPDATE',[quote.id])).rows[0];
    if(!hold||hold.released_at||!hold.live)throw new DomainError('The booking allocation expired. Request a new quotation before paying.',409);
    const lines=(await c.query("SELECT policy_snapshot->'acceptedMethods' methods FROM booking_request_line WHERE request_id=$1",[id])).rows;
    if(!lines.length||lines.some(line=>!Array.isArray(line.methods)||!line.methods.includes('PAYMONGO')))throw new DomainError('The saved agency policy does not accept PayMongo for this request.',409);
    if((await c.query('SELECT 1 FROM booking_payment_account WHERE request_id=$1 LIMIT 1',[id])).rowCount)throw new DomainError('This request already has historical payment activity. Reconcile its original channel first.',409);
    if((await c.query('SELECT 1 FROM paymongo_checkout WHERE request_id=$1 LIMIT 1',[id])).rowCount)throw new DomainError('A checkout is already prepared for this request. Recover its original provider session before creating another.',409);
    const amount=z.object({serviceCentavos:z.number().int().nonnegative(),refundableDepositCentavos:z.number().int().nonnegative(),totalCentavos:z.number().int().positive().max(Number.MAX_SAFE_INTEGER)}).parse(quote.public_snapshot.totals);
    if(!Number.isSafeInteger(amount.serviceCentavos+amount.refundableDepositCentavos)||amount.serviceCentavos+amount.refundableDepositCentavos!==amount.totalCentavos)throw new DomainError('The signed booking totals require review.',409);
    const checkout=randomUUID(),providerKey=randomUUID(),payload=checkoutPayload({reference:checkout,requestId:id,amountCentavos:amount.totalCentavos,origin:process.env.APP_ORIGIN??'',methods:config.methods,idempotencyKey:providerKey},config);
    const row=(await c.query(`INSERT INTO paymongo_checkout(id,request_id,quote_id,agreement_id,agency_id,renter_id,created_by,request_version,agreement_digest,mode,merchant_fingerprint,amount_centavos,idempotency_key,command_digest,provider_idempotency_key,payload)
      VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,[checkout,id,quote.id,agreement.id,ctx.r.agency_id,ctx.user.id,ctx.r.version,agreement.digest,config.mode,merchant,amount.totalCentavos,command.idempotencyKey,hash,providerKey,payload])).rows[0];
    return prepared(row);
  });}catch(error:any){
    if(error?.code==='23505')throw new DomainError('A checkout is already prepared. Reload the original request.',409);
    throw error;
  }
}
