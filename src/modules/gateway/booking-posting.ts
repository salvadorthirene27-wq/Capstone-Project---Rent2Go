import {randomUUID} from 'node:crypto';
import {transaction} from '../../lib/db';
import {uuid} from '../../lib/http';
import {digest} from '../cart/pricing';
import {audit} from '../partners/service';
import {DomainError} from '../partners/workflow';
import {checkoutSourcePayable,type StoredCheckout} from './checkout-lifecycle';

const principal={id:'system:paymongo-booking',role:'RENTER' as const};
/** Internal verified-receipt consumer, not a renter-selected result. All writes
 * share the booking lock and transaction; receipt retries cannot post twice.
 * This does not release centrally held funds or execute any transfer/refund. */
export async function postCheckoutPayment(checkoutId:string){return transaction(async c=>{
  const row=(await c.query<StoredCheckout>('SELECT * FROM paymongo_checkout WHERE id=$1',[uuid.parse(checkoutId)])).rows[0];
  if(!row)throw new DomainError('Checkout not found.',404);
  const request=(await c.query('SELECT status FROM booking_request WHERE id=$1 FOR UPDATE',[row.request_id])).rows[0];
  const old=(await c.query('SELECT outcome,collection_id FROM paymongo_booking_posting WHERE checkout_id=$1',[row.id])).rows[0];
  if(old)return {posted:true,outcome:old.outcome as string,collectionId:old.collection_id as string|null};
  const p=(await c.query('SELECT * FROM paymongo_checkout_payment WHERE checkout_id=$1',[row.id])).rows[0];
  if(!p)return {posted:false};
  const closed=Boolean((await c.query('SELECT 1 FROM booking_financial_close WHERE request_id=$1',[row.request_id])).rowCount);
  const conflict=Boolean((await c.query('SELECT 1 FROM booking_payment_account WHERE request_id=$1 LIMIT 1',[row.request_id])).rowCount);
  let outcome=closed?'CLOSED_LIABILITY':conflict?'CHANNEL_CONFLICT':'COLLECTED',collectionId:string|null=null;
  if(outcome==='COLLECTED'){
    const payable=await checkoutSourcePayable(c,row),review=Boolean((await c.query('SELECT 1 FROM paymongo_checkout_state WHERE checkout_id=$1 AND review_required',[row.id])).rowCount);
    const hold=(await c.query('SELECT id FROM booking_hold WHERE quote_id=$1 FOR UPDATE',[row.quote_id])).rows[0];
    if(!hold)throw new DomainError('The original booking allocation requires independent review.',409);
    const environment=row.mode==='test'?'DEMO':'MANUAL',account=randomUUID(),command=randomUUID(),attempt=randomUUID();collectionId=randomUUID();
    await c.query('INSERT INTO booking_payment_account(id,request_id,quote_id,agreement_id,agency_id,environment)VALUES($1,$2,$3,$4,$5,$6)',[account,row.request_id,row.quote_id,row.agreement_id,row.agency_id,environment]);
    await c.query("INSERT INTO booking_payment_command(id,request_id,actor_id,idempotency_key,digest,action)VALUES($1,$2,$3,$4,$5,'PROVIDER_CONFIRMED')",[command,row.request_id,principal.id,row.id,digest({checkout:row.id,receipt:p.id})]);
    await c.query("INSERT INTO booking_payment_attempt(id,account_id,request_id,quote_id,agreement_id,command_id,actor_id,method,amount_centavos,reference,normalized_reference,initial_outcome,note)VALUES($1,$2,$3,$4,$5,$6,$7,'PAYMONGO',$8,$9,$9,'CONFIRMED','Provider-confirmed central collection')",[attempt,account,row.request_id,row.quote_id,row.agreement_id,command,principal.id,p.amount_centavos,p.payment_id]);
    const names=(await c.query("SELECT body->>'agencyName' agency,body->>'renterName' renter FROM booking_agreement WHERE id=$1",[row.agreement_id])).rows[0];
    const collection=(await c.query(`INSERT INTO booking_payment_collection(id,attempt_id,account_id,request_id,quote_id,agreement_id,agency_id,environment,method,amount_centavos,reference,normalized_reference,recorded_by,receiver_name,agency_name,renter_name,requires_reconciliation)
      SELECT $1,$2,$3,$4,$5,$6,$7,$8,'PAYMONGO',$9,$10,$10,$11,'Rent2Go via PayMongo',$12,$13,
        $14::boolean OR h.released_at IS NOT NULL OR h.expires_at<=clock_timestamp()
      FROM booking_hold h WHERE h.id=$15 RETURNING requires_reconciliation`,[collectionId,attempt,account,row.request_id,row.quote_id,row.agreement_id,row.agency_id,environment,p.amount_centavos,p.payment_id,principal.id,names.agency,names.renter,p.requires_reconciliation||!payable||review,hold.id])).rows[0];
    if(!collection.requires_reconciliation)await c.query('INSERT INTO booking_hold_commitment(hold_id,request_id,quote_id,first_collection_id)VALUES($1,$2,$3,$4)',[hold.id,row.request_id,row.quote_id,collectionId]);
    const cancelled=['CANCELLED','CANCELLED_RECONCILIATION_PENDING'].includes(request.status);
    const status=cancelled?'CANCELLED_RECONCILIATION_PENDING':collection.requires_reconciliation?'PAYMENT_RECONCILIATION_REQUIRED':'READY_FOR_SERVICE';
    await c.query('UPDATE booking_request SET status=$2,version=version+1 WHERE id=$1',[row.request_id,status]);
  }else{
    // Preserve the closed ledger or unrelated channel. The exact received amount
    // remains an explicit central liability requiring a compensating workflow.
    await c.query('UPDATE booking_request SET version=version+1 WHERE id=$1',[row.request_id]);
  }
  await c.query('INSERT INTO paymongo_booking_posting(checkout_id,payment_receipt_id,request_id,quote_id,agreement_id,amount_centavos,outcome,collection_id)VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[row.id,p.id,row.request_id,row.quote_id,row.agreement_id,p.amount_centavos,outcome,collectionId]);
  const message=outcome==='COLLECTED'?'PayMongo-confirmed payment recorded. Funds are held centrally; any refundable deposit and later agency disbursement remain separate.':'PayMongo-confirmed funds retained for independent reconciliation. Existing financial records and allocations remain unchanged.';
  await c.query('INSERT INTO booking_event(id,request_id,actor_id,action,message)VALUES($1,$2,$3,$4,$5)',[randomUUID(),row.request_id,principal.id,'PAYMONGO_PAYMENT_POSTED',message]);
  await audit(c,principal,'PAYMONGO_PAYMENT_POSTED',row.request_id,{checkoutId:row.id,receiptId:p.id,outcome});
  await c.query(`INSERT INTO booking_notification(id,request_id,recipient_id,message)
    SELECT gen_random_uuid(),$1,a.id,$2 FROM app_actor a WHERE NOT a.suspended AND NOT a.is_test_fixture AND
    (a.id=$3 OR a.id IN(SELECT owner_id FROM agency WHERE id=$4) OR a.id IN(SELECT actor_id FROM agency_member WHERE agency_id=$4 AND active))`,[row.request_id,message,row.renter_id,row.agency_id]);
  return {posted:true,outcome,collectionId};
});}
