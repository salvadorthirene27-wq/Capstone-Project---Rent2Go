import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {transaction} from '../../lib/db';
import {DomainError,type Actor} from '../partners/workflow';
import {digest} from '../cart/pricing';
import {financialContext,financialLines,lockFinancialAuthority} from '../bookings/finance-context';
import {acceptedSettlement} from '../bookings/settlement';
import {gatewayBookingWork} from './booking-guard';
import {balanceSource} from './balance-source';
import {checkoutPayload,payMongoConfig} from './paymongo';
import {custodyNotice} from './custody-notice';
export const balanceCheckoutCommand=z.object({version:z.number().int().positive(),idempotencyKey:z.uuid(),settlementId:z.uuid(),digest:z.string().regex(/^[a-f0-9]{64}$/),custodyConsent:z.object({revision:z.literal(custodyNotice.revision),digest:z.literal(custodyNotice.digest),accepted:z.literal(true)}).strict()}).strict();
export async function prepareBalanceCheckout(actor:Actor,id:string,input:unknown){
 const command=balanceCheckoutCommand.parse(input),config=payMongoConfig(),merchant=createHash('sha256').update(config.secretKey).digest('hex'),hash=digest({channel:'PAYMONGO_SETTLEMENT',command,merchant,mode:config.mode});
 return transaction(async c=>{
 const ctx=await financialContext(c,actor,id,true);if(!ctx.owner)throw new DomainError('Only the renter may prepare their accepted settlement balance.',403);
 const quote=(await c.query('SELECT id FROM booking_quotation WHERE request_id=$1 ORDER BY revision DESC LIMIT 1',[id])).rows[0];await lockFinancialAuthority(c,ctx,false,quote?await financialLines(c,quote.id):[]);
 const old=(await c.query('SELECT id,command_digest FROM paymongo_checkout WHERE request_id=$1 AND created_by=$2 AND idempotency_key=$3',[id,ctx.user.id,command.idempotencyKey])).rows[0];if(old){if(old.command_digest!==hash)throw new DomainError('Retry key belongs to another checkout source.',409);return {id:old.id as string};}
 if(ctx.r.version!==command.version)throw new DomainError('The booking changed. Refresh the accepted settlement balance.',409);
 if((await gatewayBookingWork(c,id)).unresolved)throw new DomainError('Reconcile or confirm expiry of the original checkout before starting another.',409);
 const s=await acceptedSettlement(c,ctx,command.settlementId,command.digest),amount=s.b.funds?.additionalBalanceCentavos??0;if(amount<=0||!Number.isSafeInteger(amount))throw new DomainError('No additional settlement balance is due.',409);
 const original=(await c.query("SELECT a.agreement_id,x.agreement_digest,x.mode,x.merchant_fingerprint FROM booking_payment_account a JOIN paymongo_booking_posting p ON p.quote_id=a.quote_id AND p.agreement_id=a.agreement_id AND p.outcome='COLLECTED' JOIN paymongo_checkout x ON x.id=p.checkout_id WHERE a.request_id=$1 ORDER BY x.created_at LIMIT 1",[id])).rows[0];
 if(!original||original.mode!==config.mode||original.merchant_fingerprint!==merchant)throw new DomainError('Use the original verified PayMongo merchant and financial environment.',409);
 await balanceSource(c,{request_id:id,renter_id:ctx.user.id,quote_id:s.row.quote_id,agreement_id:original.agreement_id,amount_centavos:String(amount)},{settlement_id:s.row.id,settlement_digest:s.row.digest});
 const checkout=randomUUID(),providerKey=randomUUID(),payload=checkoutPayload({reference:checkout,requestId:id,amountCentavos:amount,origin:process.env.APP_ORIGIN??'',methods:config.methods,idempotencyKey:providerKey},config);
 await c.query('INSERT INTO paymongo_checkout(id,request_id,quote_id,agreement_id,agency_id,renter_id,created_by,request_version,agreement_digest,mode,merchant_fingerprint,amount_centavos,idempotency_key,command_digest,provider_idempotency_key,payload,purpose)VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',[checkout,id,s.row.quote_id,original.agreement_id,ctx.r.agency_id,ctx.user.id,ctx.r.version,original.agreement_digest,config.mode,merchant,amount,command.idempotencyKey,hash,providerKey,payload,'SETTLEMENT']);
 await c.query('INSERT INTO paymongo_settlement_checkout(checkout_id,settlement_id,request_id,settlement_digest)VALUES($1,$2,$3,$4)',[checkout,s.row.id,id,s.row.digest]);await c.query('INSERT INTO paymongo_checkout_consent(checkout_id,actor_id,revision,digest,body)VALUES($1,$2,$3,$4,$5)',[checkout,ctx.user.id,custodyNotice.revision,custodyNotice.digest,custodyNotice.body]);return {id:checkout};
 });
}
