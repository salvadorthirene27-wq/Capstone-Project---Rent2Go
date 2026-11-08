import {createHash,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {transaction} from '../../lib/db';
import {uuid} from '../../lib/http';
import {digest} from '../cart/pricing';
import {DomainError,type Actor} from '../partners/workflow';
import {financialContext,financialLines,lockFinancialAuthority} from '../bookings/finance-context';
import {cancellationPending} from '../bookings/cancellation-guard';
import {payMongoClient,payMongoConfig,preparedCheckoutPayload,hostedCheckoutUrl,type PayMongoConfig,type PayMongoCheckout} from './paymongo';

export type StoredCheckout={id:string;request_id:string;quote_id:string;agreement_id:string;agency_id:string;renter_id:string;agreement_digest:string;mode:'test'|'live';merchant_fingerprint:string;amount_centavos:string;provider_idempotency_key:string;payload:unknown};
type Link={provider_id:string;checkout_url:string};
const merchant=(config:PayMongoConfig)=>createHash('sha256').update(config.secretKey).digest('hex');
class ProviderMismatch extends DomainError{constructor(){super('The checkout needs independent provider reconciliation.',409);}}

export function savedCheckoutPayload(row:StoredCheckout,config:PayMongoConfig){
  if(row.mode!==config.mode||row.merchant_fingerprint!==merchant(config))throw new ProviderMismatch();
  const body=preparedCheckoutPayload(row.payload),a=body.data.attributes;
  if(a.reference_number!==row.id||a.metadata.rent2go_checkout!==row.id||a.line_items[0].amount!==Number(row.amount_centavos)||a.success_url!==new URL(`/workspace/bookings/${row.request_id}?payment_return=success`,new URL(a.success_url).origin).toString())throw new ProviderMismatch();
  return body;
}
export function matchCheckout(row:StoredCheckout,link:Link,snapshot:PayMongoCheckout,config:PayMongoConfig){
  const body=savedCheckoutPayload(row,config);
  if(snapshot.id!==link.provider_id||snapshot.mode!==row.mode||snapshot.reference!==row.id||snapshot.metadata.rent2go_checkout!==row.id||snapshot.amountCentavos!==Number(row.amount_centavos)||snapshot.checkoutUrl!==hostedCheckoutUrl(link.checkout_url)||(snapshot.paid&&!body.data.attributes.payment_method_types.includes(snapshot.paid.method as any)))throw new ProviderMismatch();
}

async function locked(c:PoolClient,id:string){
  const row=(await c.query<StoredCheckout>('SELECT * FROM paymongo_checkout WHERE id=$1',[uuid.parse(id)])).rows[0];
  if(!row)throw new DomainError('Checkout not found.',404);
  await c.query('SELECT id FROM booking_request WHERE id=$1 FOR UPDATE',[row.request_id]);
  return row;
}
async function sourcePayable(c:PoolClient,row:StoredCheckout){
  try{
    const ctx=await financialContext(c,{id:row.renter_id,role:'RENTER'},row.request_id);
    await lockFinancialAuthority(c,ctx,false,await financialLines(c,row.quote_id));
    if(!['AGREEMENT_SIGNED','PAYMENT_PARTIAL'].includes(ctx.r.status)||await cancellationPending(c,row.request_id))return false;
    if((await c.query('SELECT 1 FROM booking_financial_close WHERE request_id=$1',[row.request_id])).rowCount)return false;
    const q=(await c.query('SELECT id,digest FROM booking_quotation WHERE request_id=$1 ORDER BY revision DESC LIMIT 1',[row.request_id])).rows[0];
    const a=(await c.query(`SELECT a.id,a.digest,a.quote_digest,s.agreement_digest,s.signer_id,
      EXISTS(SELECT 1 FROM booking_agreement_event e WHERE e.agreement_id=a.id AND e.action='WITHDRAWN') withdrawn
      FROM booking_agreement a LEFT JOIN booking_agreement_signature s ON s.agreement_id=a.id
      WHERE a.request_id=$1 AND a.quote_id=$2 ORDER BY a.revision DESC LIMIT 1`,[row.request_id,row.quote_id])).rows[0];
    if(!q||q.id!==row.quote_id||!a||a.withdrawn||a.id!==row.agreement_id||a.digest!==row.agreement_digest||a.agreement_digest!==a.digest||a.quote_digest!==q.digest||a.signer_id!==row.renter_id)return false;
    return Boolean((await c.query('SELECT 1 FROM booking_hold WHERE quote_id=$1 AND released_at IS NULL AND expires_at>clock_timestamp()',[row.quote_id])).rowCount);
  }catch(error){if(error instanceof DomainError)return false;throw error;}
}

async function claim(id:string,config:PayMongoConfig,force:boolean){return transaction(async c=>{
  const row=await locked(c,id);savedCheckoutPayload(row,config);
  await c.query('INSERT INTO paymongo_checkout_state(checkout_id)VALUES($1) ON CONFLICT DO NOTHING',[id]);
  const state=(await c.query(`SELECT *,lease_until>clock_timestamp() busy,next_poll_at>clock_timestamp() cooling,
    first_dispatch_at<clock_timestamp()-interval '20 hours' window_closed FROM paymongo_checkout_state WHERE checkout_id=$1`,[id])).rows[0];
  const link=(await c.query<Link>('SELECT provider_id,checkout_url FROM paymongo_checkout_link WHERE checkout_id=$1',[id])).rows[0];
  const end=(await c.query('SELECT kind FROM paymongo_checkout_end WHERE checkout_id=$1',[id])).rows[0];
  const paid=Boolean((await c.query('SELECT 1 FROM paymongo_checkout_payment WHERE checkout_id=$1',[id])).rowCount);
  if(end?.kind==='ABANDONED_BEFORE_DISPATCH'&&!link)return null;
  if(state.busy||(!force&&state.cooling)||(!force&&(end||paid))||(!link&&state.review_required))return null;
  const payable=await sourcePayable(c,row);
  if(!link&&!state.first_dispatch_at&&!payable){
    await c.query("INSERT INTO paymongo_checkout_end(checkout_id,kind)VALUES($1,'ABANDONED_BEFORE_DISPATCH') ON CONFLICT DO NOTHING",[id]);
    await c.query("UPDATE paymongo_checkout_state SET last_error='SOURCE_CLOSED' WHERE checkout_id=$1",[id]);return null;
  }
  if(!link&&state.window_closed){
    await c.query("UPDATE paymongo_checkout_state SET review_required=true,last_error='CREATION_WINDOW_CLOSED' WHERE checkout_id=$1",[id]);return null;
  }
  const nonce=randomUUID();
  await c.query(`UPDATE paymongo_checkout_state SET lease_nonce=$2,lease_until=clock_timestamp()+interval '30 seconds',
    next_poll_at=clock_timestamp()+interval '30 seconds',first_dispatch_at=CASE WHEN $3::boolean THEN COALESCE(first_dispatch_at,clock_timestamp()) ELSE first_dispatch_at END WHERE checkout_id=$1`,[id,nonce,!link]);
  await c.query('INSERT INTO paymongo_checkout_dispatch(id,checkout_id,lease_nonce,action)VALUES($1,$2,$3,$4)',[randomUUID(),id,nonce,link?'RETRIEVE':'CREATE']);
  return {row,link,nonce,payable,expiryKey:state.expiry_idempotency_key as string};
});}

async function finish(id:string,nonce:string,error:null|'PROVIDER_UNAVAILABLE'|'PROVIDER_MISMATCH'|'EXPIRY_PENDING',review=false){return transaction(async c=>{
  await locked(c,id);
  await c.query(`UPDATE paymongo_checkout_state SET lease_nonce=NULL,lease_until=NULL,last_error=$3,
    review_required=review_required OR $4::boolean,next_poll_at=clock_timestamp()+interval '30 seconds'
    WHERE checkout_id=$1 AND lease_nonce=$2`,[id,nonce,error,review]);
});}
async function linkCreated(row:StoredCheckout,created:{id:string;mode:'test'|'live';checkoutUrl:string}){return transaction(async c=>{
  await locked(c,row.id);
  if(created.mode!==row.mode)throw new ProviderMismatch();
  const old=(await c.query<Link>('SELECT provider_id,checkout_url FROM paymongo_checkout_link WHERE checkout_id=$1',[row.id])).rows[0];
  if(old){if(old.provider_id!==created.id||old.checkout_url!==created.checkoutUrl)throw new ProviderMismatch();return old;}
  await c.query('INSERT INTO paymongo_checkout_link(checkout_id,mode,merchant_fingerprint,provider_id,checkout_url)VALUES($1,$2,$3,$4,$5)',[row.id,row.mode,row.merchant_fingerprint,created.id,hostedCheckoutUrl(created.checkoutUrl)]);
  return {provider_id:created.id,checkout_url:created.checkoutUrl};
});}
async function observe(row:StoredCheckout,link:Link,snapshot:PayMongoCheckout,config:PayMongoConfig){return transaction(async c=>{
  await locked(c,row.id);matchCheckout(row,link,snapshot,config);
  if(snapshot.paid){
    const p=snapshot.paid,old=(await c.query('SELECT * FROM paymongo_checkout_payment WHERE checkout_id=$1',[row.id])).rows[0];
    if(old){
      if(old.payment_id!==p.id||Number(old.amount_centavos)!==p.amountCentavos||Number(old.fee_centavos)!==p.feeCentavos||Number(old.net_centavos)!==p.netCentavos||old.method!==p.method)throw new ProviderMismatch();
    }else{
      const ended=Boolean((await c.query('SELECT 1 FROM paymongo_checkout_end WHERE checkout_id=$1',[row.id])).rowCount);
      const reconcile=ended||!await sourcePayable(c,row);
      await c.query(`INSERT INTO paymongo_checkout_payment(id,checkout_id,provider_id,mode,merchant_fingerprint,payment_id,amount_centavos,fee_centavos,net_centavos,method,requires_reconciliation)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[randomUUID(),row.id,link.provider_id,row.mode,row.merchant_fingerprint,p.id,p.amountCentavos,p.feeCentavos,p.netCentavos,p.method,reconcile]);
    }
  }
  await c.query('INSERT INTO paymongo_checkout_observation(id,checkout_id,provider_id,status,paid,projection_digest)VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(checkout_id,projection_digest) DO NOTHING',[randomUUID(),row.id,link.provider_id,snapshot.status,Boolean(snapshot.paid),digest(snapshot)]);
  if(snapshot.status==='expired')await c.query("INSERT INTO paymongo_checkout_end(checkout_id,kind)VALUES($1,'EXPIRED') ON CONFLICT DO NOTHING",[row.id]);
});}

/** Private worker operation. `force` is for a separately authenticated provider
 * event/operator recovery, never a customer-supplied query parameter. It does
 * not bypass creation-window, source, merchant or lease checks. */
export async function processCheckout(id:string,options:{transport?:typeof fetch;force?:boolean}={}){
  uuid.parse(id);const config=payMongoConfig(),job=await claim(id,config,options.force===true);
  if(!job)return {processed:false};
  const client=payMongoClient(config,options.transport);
  try{
    let link=job.link;
    if(!link){
      // Save the minimal creation result before the first retrieve, including
      // when the source became unavailable during the outbound request.
      link=await linkCreated(job.row,await client.createPrepared(job.row.payload,job.row.provider_idempotency_key));
    }
    let snapshot=await client.retrieve(link.provider_id);matchCheckout(job.row,link,snapshot,config);
    await observe(job.row,link,snapshot,config);
    const payable=await transaction(async c=>{await locked(c,id);return sourcePayable(c,job.row);});
    if(!snapshot.paid&&snapshot.status==='active'&&!payable){
      try{
        snapshot=await client.expire(link.provider_id,job.expiryKey);
        await observe(job.row,link,snapshot,config);
      }catch(error){
        // A 400 can mean a paid/processing session, not successful expiration.
        // Retrieve again; an uncertain outcome stays open and cannot be replaced.
        if((error as {providerStatus?:number}).providerStatus!==400)throw error;
        snapshot=await client.retrieve(link.provider_id);await observe(job.row,link,snapshot,config);
        if(!snapshot.paid&&snapshot.status!=='expired'){await finish(id,job.nonce,'EXPIRY_PENDING');return {processed:true,pending:true};}
      }
    }
    await finish(id,job.nonce,null);
    return {processed:true,paid:Boolean(snapshot.paid),expired:snapshot.status==='expired'};
  }catch(error){
    const mismatch=error instanceof ProviderMismatch||(error as {code?:string}).code==='23505';
    await finish(id,job.nonce,mismatch?'PROVIDER_MISMATCH':'PROVIDER_UNAVAILABLE',mismatch);
    // No raw provider response, billing fields or secret-bearing error cause is
    // persisted or returned. The durable link remains available for recovery.
    return {processed:true,pending:true,requiresReview:mismatch};
  }
}

export async function bookingCheckoutStatus(actor:Actor,requestId:string){return transaction(async c=>{
  const ctx=await financialContext(c,actor,requestId,true);
  const row=(await c.query<StoredCheckout>('SELECT * FROM paymongo_checkout WHERE request_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',[requestId])).rows[0];
  if(!row)return {checkout:null};
  const link=(await c.query<Link>('SELECT provider_id,checkout_url FROM paymongo_checkout_link WHERE checkout_id=$1',[row.id])).rows[0];
  const payment=(await c.query('SELECT id,amount_centavos,fee_centavos,requires_reconciliation,verified_at FROM paymongo_checkout_payment WHERE checkout_id=$1',[row.id])).rows[0];
  const end=(await c.query('SELECT kind FROM paymongo_checkout_end WHERE checkout_id=$1',[row.id])).rows[0];
  const state=(await c.query('SELECT review_required,last_error,lease_until>clock_timestamp() busy FROM paymongo_checkout_state WHERE checkout_id=$1',[row.id])).rows[0];
  let configured=false;
  try{savedCheckoutPayload(row,payMongoConfig());configured=true;}catch{}
  const canResume=Boolean(ctx.owner&&configured&&link&&!payment&&!end&&!state?.review_required&&await sourcePayable(c,row));
  return {checkout:{id:row.id,mode:row.mode,amountCentavos:Number(row.amount_centavos),
    status:payment?(payment.requires_reconciliation||state?.review_required?'PAID_RECONCILIATION':'PAID_PENDING_POSTING'):state?.review_required?'REVIEW_REQUIRED':end?'EXPIRED':state?.busy?'PREPARING':state?.last_error==='EXPIRY_PENDING'?'CLOSING':link?'AWAITING_PAYMENT':'PREPARED',
    checkoutUrl:canResume?hostedCheckoutUrl(link.checkout_url):null,
    payment:payment?{id:payment.id as string,amountCentavos:Number(payment.amount_centavos),feeCentavos:ctx.operator?Number(payment.fee_centavos):null,verifiedAt:(payment.verified_at as Date).toISOString()}:null}};
});}
