import {processNotificationBatch} from './notifications';
import {createHash} from 'node:crypto';
import {db} from '../../lib/db';
import {payMongoConfig} from './paymongo';
import {processCheckout} from './checkout-lifecycle';
import {postCheckoutPayment} from './booking-posting';

export const checkoutWorkerName='PAYMONGO_CHECKOUT_SYNC' as const;
/** Internal bounded batch. The managed-worker lease coordinates processes;
 * per-checkout leases and atomic posting also protect webhook/worker races.
 * A verified receipt is committed by lifecycle processing before posting starts.
 * No raw provider body or exception message is logged or returned. */
export async function runCheckoutBatch(limit=5,options:{transport?:typeof fetch}={}){
 if(!Number.isInteger(limit)||limit<1||limit>20)throw Error('Invalid payment batch size.');
 const config=payMongoConfig(),merchant=createHash('sha256').update(config.secretKey).digest('hex');
 // Check the entire internal schema before dispatching any provider request.
 const schema=(await db.query("SELECT to_regclass('paymongo_booking_posting') posting,to_regclass('paymongo_checkout_state') lifecycle")).rows[0];
 if(!schema.posting||!schema.lifecycle)throw Error('Payment worker schema is unavailable.');
 let processed=0,failed=false;
 try{processed=await processNotificationBatch(limit);}catch{failed=true;}
 const rows=(await db.query<{id:string}>(`SELECT p.id FROM paymongo_checkout p
 LEFT JOIN paymongo_checkout_state s ON s.checkout_id=p.id
 LEFT JOIN paymongo_checkout_payment receipt ON receipt.checkout_id=p.id
 LEFT JOIN paymongo_booking_posting posting ON posting.checkout_id=p.id
 LEFT JOIN paymongo_checkout_end ended ON ended.checkout_id=p.id
 WHERE p.mode=$1 AND p.merchant_fingerprint=$2
 AND (s.lease_until IS NULL OR s.lease_until<=clock_timestamp())
 AND (s.next_poll_at IS NULL OR s.next_poll_at<=clock_timestamp())
 AND ((receipt.id IS NOT NULL AND posting.checkout_id IS NULL)
 OR (receipt.id IS NULL AND ended.checkout_id IS NULL AND NOT COALESCE(s.review_required,false)))
 ORDER BY (receipt.id IS NOT NULL) DESC,COALESCE(s.next_poll_at,p.created_at),p.id LIMIT $3`,[config.mode,merchant,limit])).rows;
 for(const row of rows){
  try{
   await processCheckout(row.id,{transport:options.transport});
   await postCheckoutPayment(row.id);
   processed++; // Inspected jobs, never a claim of successful payment.
   const state=(await db.query('SELECT last_error FROM paymongo_checkout_state WHERE checkout_id=$1',[row.id])).rows[0];
   if(state?.last_error==='PROVIDER_UNAVAILABLE')failed=true;
  }catch{
   failed=true;
   // Back off a failed posting too. Its immutable verified receipt is retained.
   await db.query(`UPDATE paymongo_checkout_state SET next_poll_at=clock_timestamp()+interval '30 seconds' WHERE checkout_id=$1`,[row.id]).catch(()=>{});
  }
 }
 if(failed){const error=new Error('Some payment jobs require another processing attempt.');error.name='PayMongoBatchError';throw error;}
 return processed;
}
