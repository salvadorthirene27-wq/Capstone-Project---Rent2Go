import {createHash,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {db,transaction} from '../../lib/db';
import {digest} from '../cart/pricing';
import {DomainError} from '../partners/workflow';
import {payMongoConfig,verifyPayMongoSignature,payMongoNotificationEnvelope,parseCheckout,type PayMongoCheckout,type PayMongoConfig} from './paymongo';
import {recordCheckoutObservation,type StoredCheckout} from './checkout-lifecycle';
export function notificationConfig(){const config=payMongoConfig();if(config.notificationMode!=='webhook')throw new DomainError('Payment notifications are not enabled.',503);return config;}
const fingerprint=(config:PayMongoConfig)=>createHash('sha256').update(config.secretKey).digest('hex');
async function lookup(c:PoolClient,providerId:string|null,mode:string,merchant:string){
 if(!providerId)return null;
 return(await c.query<StoredCheckout&{provider_id:string;checkout_url:string}>('SELECT x.*,l.provider_id,l.checkout_url FROM paymongo_checkout_link l JOIN paymongo_checkout x ON x.id=l.checkout_id WHERE l.provider_id=$1 AND l.mode=$2 AND l.merchant_fingerprint=$3',[providerId,mode,merchant])).rows[0]??null;
}
async function quarantine(c:PoolClient,ids:string[]){for(const id of [...new Set(ids)].sort()){
 await c.query('INSERT INTO paymongo_checkout_state(checkout_id)VALUES($1) ON CONFLICT DO NOTHING',[id]);
 await c.query("UPDATE paymongo_checkout_state SET review_required=true,last_error='PROVIDER_MISMATCH' WHERE checkout_id=$1",[id]);
}}
function safeProjection(snapshot:PayMongoCheckout):PayMongoCheckout{
 const id=snapshot.metadata.rent2go_checkout??'';
 return {...snapshot,metadata:{rent2go_checkout:/^[a-f0-9-]{36}$/i.test(id)?id:''}};
}
/** No booking posting or outbound request occurs here. Acknowledgment means
 * authenticated delivery facts were committed, never that a booking is paid. */
export async function receivePayMongoNotification(raw:Uint8Array,header:string|null){
 const config=notificationConfig();
 // Authenticate before consuming a database connection. This first pass checks
 // the MAC against its own timestamp; the real PostgreSQL clock check follows.
 const timestamp=Number(header?.split(',').find(p=>/^\s*t=/.test(p))?.split('=')[1]);
 verifyPayMongoSignature(raw,header,config,timestamp*1000);
 return transaction(async c=>{
  const now=(await c.query('SELECT clock_timestamp() n')).rows[0].n as Date;
  verifyPayMongoSignature(raw,header,config,now.getTime());
  const event=payMongoNotificationEnvelope(raw,config.mode),merchant=fingerprint(config),rawDigest=createHash('sha256').update(raw).digest('hex');
  let kind:'PAYMENT'|'IGNORED'|'INVALID_PAID'='IGNORED',projection:PayMongoCheckout|null=null,providerId:string|null=null;
  if(event.attributes.type==='checkout_session.payment.paid'){
   kind='INVALID_PAID';const resource=event.attributes.data as {id?:unknown}|null;
   if(resource&&typeof resource.id==='string'&&/^cs_[A-Za-z0-9]{1,157}$/.test(resource.id))providerId=resource.id;
   try{const snapshot=parseCheckout(event.attributes.data,config.mode);if(snapshot.paid){projection=safeProjection(snapshot);providerId=snapshot.id;kind='PAYMENT';}}catch{ /* Authenticated but unusable facts remain visible for review. */ }
  }
  const contentDigest=digest({type:event.attributes.type,kind,projection,providerId,invalid:kind==='INVALID_PAID'?rawDigest:null});
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${config.mode}:${merchant}:${event.id}`]);
  const old=(await c.query('SELECT * FROM paymongo_notification WHERE mode=$1 AND merchant_fingerprint=$2 AND provider_event_id=$3',[config.mode,merchant,event.id])).rows[0];
  if(old?.content_digest===contentDigest)return {received:true};
  const linked=await lookup(c,providerId,config.mode,merchant);
  const checkoutIds=[old?.checkout_id,linked?.id].filter(Boolean) as string[];
  if(old){
   // If a session mapping appeared after the first delivery, fence it too.
   const original=await lookup(c,old.provider_id,old.mode,old.merchant_fingerprint);if(original)checkoutIds.push(original.id);
  }
  if(checkoutIds.length)await c.query('SELECT id FROM booking_request WHERE id IN(SELECT request_id FROM paymongo_checkout WHERE id=ANY($1::uuid[])) ORDER BY id FOR UPDATE',[checkoutIds]);
  if(old){
   await c.query('INSERT INTO paymongo_notification_conflict(id,notification_id,content_digest,raw_digest,provider_id,checkout_id,projection)VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(notification_id,content_digest) DO NOTHING',[randomUUID(),old.id,contentDigest,rawDigest,providerId,linked?.id??null,projection]);
   await quarantine(c,checkoutIds);return {received:true};
  }
  const id=randomUUID();await c.query('INSERT INTO paymongo_notification(id,mode,merchant_fingerprint,provider_event_id,event_type,kind,raw_digest,content_digest,provider_id,checkout_id,projection)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[id,config.mode,merchant,event.id,event.attributes.type,kind,rawDigest,contentDigest,providerId,linked?.id??null,projection]);
  await c.query('INSERT INTO paymongo_notification_state(notification_id)VALUES($1)',[id]);
  if(kind==='INVALID_PAID')await quarantine(c,checkoutIds);
  return {received:true};
 });
}
export async function processPayMongoNotification(id:string){
 const config=payMongoConfig(),merchant=fingerprint(config);
 return transaction(async c=>{
  const n=(await c.query('SELECT * FROM paymongo_notification WHERE id=$1 AND mode=$2 AND merchant_fingerprint=$3',[id,config.mode,merchant])).rows[0];
  if(!n)return {processed:false};
  const linked=await lookup(c,n.provider_id,n.mode,n.merchant_fingerprint);
  const ids=[n.checkout_id,linked?.id].filter(Boolean) as string[];
  if(ids.length)await c.query('SELECT id FROM booking_request WHERE id IN(SELECT request_id FROM paymongo_checkout WHERE id=ANY($1::uuid[])) ORDER BY id FOR UPDATE',[ids]);
  const slot=(await c.query('SELECT next_attempt_at<=clock_timestamp() due FROM paymongo_notification_state WHERE notification_id=$1 FOR UPDATE SKIP LOCKED',[id])).rows[0];
  if(!slot?.due||(await c.query('SELECT 1 FROM paymongo_notification_result WHERE notification_id=$1',[id])).rowCount)return {processed:false};
  let outcome='IGNORED';
  if((await c.query('SELECT 1 FROM paymongo_notification_conflict WHERE notification_id=$1 LIMIT 1',[id])).rowCount)outcome='CONFLICT';
  else if(n.kind==='INVALID_PAID')outcome='INVALID_PAYLOAD';
  else if(n.kind==='PAYMENT'){
   if(!linked)outcome='UNMATCHED';
   else{
    await c.query('SAVEPOINT notification_receipt');
    try{await recordCheckoutObservation(c,linked,{provider_id:linked.provider_id,checkout_url:linked.checkout_url},n.projection,config);outcome='RECORDED';await c.query('RELEASE SAVEPOINT notification_receipt');}
    catch(e){await c.query('ROLLBACK TO SAVEPOINT notification_receipt');await c.query('RELEASE SAVEPOINT notification_receipt');if(e instanceof DomainError&&e.status===409||(e as {code?:string}).code==='23505')outcome='MISMATCH';else throw e;}
   }
  }
  if(outcome==='RECORDED'&&linked)await c.query('UPDATE paymongo_checkout_state SET next_poll_at=LEAST(next_poll_at,clock_timestamp()) WHERE checkout_id=$1',[linked.id]);
  if(['CONFLICT','INVALID_PAYLOAD','MISMATCH'].includes(outcome))await quarantine(c,ids);
  await c.query('INSERT INTO paymongo_notification_result(notification_id,checkout_id,outcome)VALUES($1,$2,$3)',[id,linked?.id??n.checkout_id,outcome]);
  return {processed:true,outcome};
 });
}
export async function processNotificationBatch(limit=5){
 if(!Number.isInteger(limit)||limit<1||limit>20)throw Error('Invalid notification batch size.');
 const config=payMongoConfig();if(!(await db.query("SELECT to_regclass('paymongo_notification') ready")).rows[0].ready)return 0;
 const rows=(await db.query('SELECT n.id FROM paymongo_notification n JOIN paymongo_notification_state s ON s.notification_id=n.id WHERE n.mode=$1 AND n.merchant_fingerprint=$2 AND s.next_attempt_at<=clock_timestamp() AND NOT EXISTS(SELECT 1 FROM paymongo_notification_result r WHERE r.notification_id=n.id) ORDER BY s.next_attempt_at,n.received_at,n.id LIMIT $3',[config.mode,fingerprint(config),limit])).rows;
 let processed=0,failed=false;
 for(const row of rows){try{if((await processPayMongoNotification(row.id)).processed)processed++;}catch{failed=true;await db.query("UPDATE paymongo_notification_state SET next_attempt_at=clock_timestamp()+interval '30 seconds' WHERE notification_id=$1",[row.id]).catch(()=>{});}}
 if(failed){const e=new Error('A payment notification needs another processing attempt.');e.name='PayMongoNotificationBatchError';throw e;}
 return processed;
}
