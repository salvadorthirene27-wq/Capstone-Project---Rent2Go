import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {Pool} from 'pg';
import {db,transaction} from '../../src/lib/db';
import {gatewayAgency,gatewayBooking} from '../helpers/gateway';
import {processCheckout,bookingCheckoutStatus} from '../../src/modules/gateway/checkout-lifecycle';
import {postCheckoutPayment} from '../../src/modules/gateway/booking-posting';
import {gatewayBookingWork,assertGatewaySourceReplaceable} from '../../src/modules/gateway/booking-guard';
import {prepareBookingCheckout} from '../../src/modules/gateway/booking-checkout';
import {getPayments,changePayment} from '../../src/modules/bookings/payment';
import {getCancellation,changeCancellation} from '../../src/modules/bookings/cancellation';
import {getRefunds,changeRefund} from '../../src/modules/bookings/refund';
import {financialOpenWork} from '../../src/modules/bookings/settlement';
let context:Awaited<ReturnType<typeof gatewayAgency>>;
beforeAll(async()=>{
 vi.stubEnv('PAYMONGO_ENABLED','true');vi.stubEnv('PAYMONGO_MODE','test');vi.stubEnv('PAYMONGO_SECRET_KEY','sk_test_postingfixture123456');vi.stubEnv('PAYMONGO_PAYMENT_METHODS','card,gcash');vi.stubEnv('PAYMONGO_NOTIFICATION_MODE','poll');vi.stubEnv('APP_ORIGIN','http://localhost:3100');
 context=await gatewayAgency();
},60000);
afterAll(async()=>{vi.unstubAllEnvs();await db.end();});
async function fixture(ms=3600000){const f=await gatewayBooking(context,ms);return {...f,row:(await db.query('SELECT * FROM paymongo_checkout WHERE id=$1',[f.checkoutId])).rows[0]};}
function resource(f:Awaited<ReturnType<typeof fixture>>,paid=true,expired=false){
 const id=`cs_${f.checkoutId.replaceAll('-','')}`;
 return {id,type:'checkout_session',attributes:{livemode:false,status:expired?'expired':'active',reference_number:f.checkoutId,checkout_url:`https://checkout.paymongo.com/${id}`,metadata:{rent2go_checkout:f.checkoutId},line_items:f.row.payload.data.attributes.line_items,payments:paid?[{id:`pay_${f.checkoutId.replaceAll('-','')}`,attributes:{amount:10000,fee:500,net_amount:9500,currency:'PHP',status:'paid',livemode:false,source:{type:'card'}}}]:[]}};
}
async function receive(f:Awaited<ReturnType<typeof fixture>>){
 const s=resource(f),transport=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({data:{id:s.id,type:s.type,attributes:{livemode:false,checkout_url:s.attributes.checkout_url}}})).mockResolvedValueOnce(Response.json({data:s}));
 expect(await processCheckout(f.checkoutId,{transport})).toMatchObject({paid:true});
}
async function work(id:string){return transaction(c=>gatewayBookingWork(c,id));}
it('posts the exact gross amount once under concurrent retries, with central provenance and one inventory commitment',async()=>{
 const f=await fixture();await receive(f);
 expect((await transaction(c=>financialOpenWork(c,f.id))).payments).toBe(1);
 const [a,b]=await Promise.all([postCheckoutPayment(f.checkoutId),postCheckoutPayment(f.checkoutId)]);
 expect(a).toEqual(b);expect(a).toMatchObject({posted:true,outcome:'COLLECTED'});
 const k=(await db.query('SELECT * FROM booking_payment_collection WHERE request_id=$1',[f.id])).rows;
 expect(k).toHaveLength(1);expect(k[0]).toMatchObject({method:'PAYMONGO',environment:'DEMO',amount_centavos:'10000',recorded_by:'system:paymongo-booking',receiver_name:'Rent2Go via PayMongo',requires_reconciliation:false});
 expect((await db.query('SELECT count(*) n FROM booking_hold_commitment WHERE request_id=$1',[f.id])).rows[0].n).toBe('1');
 expect((await db.query("SELECT count(*) n FROM booking_event WHERE request_id=$1 AND action='PAYMONGO_PAYMENT_POSTED'",[f.id])).rows[0].n).toBe('1');
 const state=await getPayments(context.renter,f.id);expect(state).toMatchObject({status:'READY_FOR_SERVICE',canSimulate:false,canRecordCash:false,canSubmitGcash:false,totals:{confirmedCentavos:10000,balanceCentavos:0}});
 expect((await bookingCheckoutStatus(context.renter,f.id)).checkout).toMatchObject({status:'PAID',payment:{collectionId:a.collectionId,feeCentavos:null}});
 expect((await work(f.id)).unresolved).toBe(0);
},60000);
it('cannot turn an unpaid preparation or pending provider state into a collection',async()=>{
 const f=await fixture();expect(await postCheckoutPayment(f.checkoutId)).toEqual({posted:false});
 expect((await db.query('SELECT 1 FROM booking_payment_account WHERE request_id=$1',[f.id])).rowCount).toBe(0);
 expect((await work(f.id)).unresolved).toBe(1);
},60000);
it('uses the database deadline again when posting, preserving late money without reclaiming inventory',async()=>{
 const f=await fixture(15000);await receive(f);
 expect((await db.query('SELECT requires_reconciliation FROM paymongo_checkout_payment WHERE checkout_id=$1',[f.checkoutId])).rows[0].requires_reconciliation).toBe(false);
 await db.query('SELECT pg_sleep(GREATEST(0,EXTRACT(epoch FROM (expires_at-clock_timestamp())))+0.05) FROM booking_hold WHERE id=$1',[f.hold]);
 const result=await postCheckoutPayment(f.checkoutId);expect(result.outcome).toBe('COLLECTED');
 expect((await db.query('SELECT requires_reconciliation FROM booking_payment_collection WHERE id=$1',[result.collectionId])).rows[0].requires_reconciliation).toBe(true);
 expect((await db.query('SELECT 1 FROM booking_hold_commitment WHERE request_id=$1',[f.id])).rowCount).toBe(0);
 expect((await bookingCheckoutStatus(context.renter,f.id)).checkout?.status).toBe('PAID_RECONCILIATION');
},60000);
it('records received funds after agency suspension without impersonating an active operator or reserving stock',async()=>{
 const f=await fixture();await receive(f);await db.query('UPDATE agency SET active=false WHERE id=$1',[context.agency]);
 try{
  const result=await postCheckoutPayment(f.checkoutId);
  expect((await db.query('SELECT recorded_by,requires_reconciliation FROM booking_payment_collection WHERE id=$1',[result.collectionId])).rows[0]).toMatchObject({recorded_by:'system:paymongo-booking',requires_reconciliation:true});
  expect((await db.query('SELECT 1 FROM booking_hold_commitment WHERE request_id=$1',[f.id])).rowCount).toBe(0);
 }finally{await db.query('UPDATE agency SET active=true WHERE id=$1',[context.agency]);}
},60000);
it('keeps a late receipt after financial closure as a separate liability without altering the closed ledger',async()=>{
 const f=await fixture();await receive(f);const assessment=randomUUID(),settlement=randomUUID(),close=randomUUID(),hash='a'.repeat(64);
 // A historical/incident closure is seeded directly to exercise defensive late
 // receipt handling. The normal close command rejects unresolved gateway work.
 await db.query("INSERT INTO booking_assessment(id,request_id,quote_id,revision,environment,actor_id,reason,body,digest)VALUES($1,$2,$3,1,'DEMO',$4,'Historical incident fixture','{}',$5)",[assessment,f.id,f.q,context.operator.id,hash]);
 await db.query("INSERT INTO booking_settlement(id,request_id,quote_id,assessment_id,revision,environment,actor_id,reason,body,digest)VALUES($1,$2,$3,$4,1,'DEMO',$5,'Historical incident fixture','{}',$6)",[settlement,f.id,f.q,assessment,context.operator.id,hash]);
 await db.query("INSERT INTO booking_financial_close(id,request_id,quote_id,settlement_id,agency_id,environment,actor_id,outcome,total_centavos,body,digest)VALUES($1,$2,$3,$4,$5,'DEMO',$6,'CANCELLED',0,'{}',$7)",[close,f.id,f.q,settlement,context.agency,context.operator.id,hash]);
 await db.query("UPDATE booking_request SET status='CANCELLED' WHERE id=$1",[f.id]);
 const before=(await db.query('SELECT * FROM booking_financial_close WHERE id=$1',[close])).rows[0];
 expect(await postCheckoutPayment(f.checkoutId)).toMatchObject({outcome:'CLOSED_LIABILITY',collectionId:null});
 expect((await db.query('SELECT * FROM booking_financial_close WHERE id=$1',[close])).rows[0]).toEqual(before);
 expect((await db.query('SELECT 1 FROM booking_payment_collection WHERE request_id=$1',[f.id])).rowCount).toBe(0);
 expect((await db.query('SELECT status FROM booking_request WHERE id=$1',[f.id])).rows[0].status).toBe('CANCELLED');
 expect((await work(f.id)).unresolved).toBe(1);
},60000);
it('does not overwrite an incompatible historical channel and blocks legacy commands independently of the enable flag',async()=>{
 const f=await fixture();await receive(f);const account=randomUUID();
 await db.query("INSERT INTO booking_payment_account(id,request_id,quote_id,agreement_id,agency_id,environment)VALUES($1,$2,$3,$4,$5,'MANUAL')",[account,f.id,f.q,f.g,context.agency]);
 expect(await postCheckoutPayment(f.checkoutId)).toMatchObject({outcome:'CHANNEL_CONFLICT',collectionId:null});
 vi.stubEnv('PAYMONGO_ENABLED','false');
 try{await expect(changePayment(context.renter,f.id,{action:'SIMULATE_PAYMENT',version:2,idempotencyKey:randomUUID(),agreementId:f.g,digest:'a'.repeat(64),method:'DEMO_CARD',outcome:'APPROVED'})).rejects.toMatchObject({status:409});}
 finally{vi.stubEnv('PAYMONGO_ENABLED','true');}
 expect((await db.query('SELECT id FROM booking_payment_account WHERE request_id=$1',[f.id])).rows.map(r=>r.id)).toEqual([account]);
 expect((await db.query('SELECT 1 FROM booking_payment_collection WHERE request_id=$1',[f.id])).rowCount).toBe(0);
},60000);
it('allows cancellation requests but refuses approval until the payable provider session is confirmed expired',async()=>{
 const f=await fixture(),active=resource(f,false),expired=resource(f,false,true);
 const create=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({data:{id:active.id,type:active.type,attributes:{livemode:false,checkout_url:active.attributes.checkout_url}}})).mockResolvedValueOnce(Response.json({data:active}));
 await processCheckout(f.checkoutId,{transport:create});
 let state=await getCancellation(context.renter,f.id);
 state=await changeCancellation(context.renter,f.id,{action:'REQUEST_CANCELLATION',version:state.requestVersion,idempotencyKey:randomUUID(),reason:'Synthetic cancellation'});
 const command={action:'REVIEW_CANCELLATION',version:state.requestVersion,idempotencyKey:randomUUID(),cancellationId:state.pending!.id,digest:state.pending!.digest,decision:'APPROVE',reason:'Synthetic review'};
 await expect(changeCancellation(context.operator,f.id,command)).rejects.toMatchObject({status:409});
 const transport=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({data:active})).mockResolvedValueOnce(Response.json({data:expired}));
 expect(await processCheckout(f.checkoutId,{transport,force:true})).toMatchObject({expired:true});
 expect(transport.mock.calls[1][0]).toContain('/expire');
 expect((await changeCancellation(context.operator,f.id,command)).status).toBe('CANCELLED');
},60000);
it('keeps provider refunds out of legacy simulated execution after approval',async()=>{
 const f=await fixture();await receive(f);const posted=await postCheckoutPayment(f.checkoutId);
 await db.query("UPDATE booking_request SET status='CANCELLED_RECONCILIATION_PENDING' WHERE id=$1",[f.id]);
 let s=await getRefunds(context.renter,f.id);
 s=await changeRefund(context.renter,f.id,{action:'REQUEST_REFUND',version:s.requestVersion,idempotencyKey:randomUUID(),collectionId:posted.collectionId,amountCentavos:2000,reason:'Refundable deposit'});
 const refund=s.open[0];
 s=await changeRefund(context.operator,f.id,{action:'REVIEW_REFUND',version:s.requestVersion,idempotencyKey:randomUUID(),refundId:refund.id,digest:refund.digest,decision:'APPROVE',reason:'Approved deposit refund'});
 expect(s.open[0].canSimulate).toBe(false);
 await expect(changeRefund(context.operator,f.id,{action:'SIMULATE_REFUND',version:s.requestVersion,idempotencyKey:randomUUID(),refundId:refund.id,digest:refund.digest,outcome:'APPROVED'})).rejects.toMatchObject({status:409});
 expect((await db.query('SELECT 1 FROM booking_refund_payment WHERE request_id=$1',[f.id])).rowCount).toBe(0);
},60000);
it('allows a new quotation preparation only after the earlier unpaid checkout definitively ended',async()=>{
 const f=await fixture();
 await expect(transaction(c=>assertGatewaySourceReplaceable(c,f.id))).rejects.toMatchObject({status:409});
 await db.query("INSERT INTO paymongo_checkout_end(checkout_id,kind)VALUES($1,'ABANDONED_BEFORE_DISPATCH')",[f.checkoutId]);
 await transaction(c=>assertGatewaySourceReplaceable(c,f.id));
 const q=randomUUID(),agreement=randomUUID(),hold=randomUUID();
 await db.query("UPDATE booking_hold SET released_at=clock_timestamp(),release_reason='EXPIRED' WHERE id=$1",[f.hold]);
 await db.query('INSERT INTO booking_quotation(id,request_id,revision,digest,issued_by,issued_at,expires_at,public_snapshot)SELECT $1,request_id,2,digest,issued_by,clock_timestamp(),clock_timestamp()+interval \'1 hour\',public_snapshot FROM booking_quotation WHERE id=$2',[q,f.q]);
 await db.query('INSERT INTO booking_hold(id,request_id,quote_id,expires_at)VALUES($1,$2,$3,clock_timestamp()+interval \'1 hour\')',[hold,f.id,q]);
 await db.query("INSERT INTO booking_quotation_decision(id,quote_id,actor_id,action,reason)VALUES($1,$2,$3,'ACCEPTED','Synthetic replacement')",[randomUUID(),q,context.renter.id]);
 await db.query('INSERT INTO booking_agreement(id,request_id,quote_id,revision,digest,quote_digest,template_version,issued_by,issued_at,expires_at,body,private_contact_snapshot)SELECT $1,request_id,$2,2,digest,quote_digest,template_version,issued_by,clock_timestamp(),clock_timestamp()+interval \'1 hour\',body,private_contact_snapshot FROM booking_agreement WHERE id=$3',[agreement,q,f.g]);
 await db.query('INSERT INTO booking_agreement_signature(id,agreement_id,request_id,quote_id,agreement_digest,signer_id,signer_name,consent,signed_at,mime,size_bytes,sha256,backend)SELECT $1,$2,request_id,$3,agreement_digest,signer_id,signer_name,consent,clock_timestamp(),mime,size_bytes,sha256,backend FROM booking_agreement_signature WHERE agreement_id=$4',[randomUUID(),agreement,q,f.g]);
 expect(await prepareBookingCheckout(context.renter,f.id,{version:1,idempotencyKey:randomUUID(),agreementId:agreement,digest:'a'.repeat(64)})).toMatchObject({quoteId:q,agreementId:agreement});
 expect((await db.query('SELECT count(*) n FROM paymongo_checkout WHERE request_id=$1',[f.id])).rows[0].n).toBe('2');
},60000);
it('retains test/live provenance without relabeling a synthetic live-mode receipt as a simulation',async()=>{
 vi.stubEnv('PAYMONGO_MODE','live');vi.stubEnv('PAYMONGO_LIVE_ENABLED','true');vi.stubEnv('PAYMONGO_SECRET_KEY','sk_live_syntheticpostingfixture');
 try{
  const f=await fixture(),s=resource(f);s.attributes.livemode=true;s.attributes.payments[0].attributes.livemode=true;
  const transport=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({data:{id:s.id,type:s.type,attributes:{livemode:true,checkout_url:s.attributes.checkout_url}}})).mockResolvedValueOnce(Response.json({data:s}));
  expect(await processCheckout(f.checkoutId,{transport})).toMatchObject({paid:true});
  const posted=await postCheckoutPayment(f.checkoutId);
  expect((await db.query('SELECT environment,method,amount_centavos FROM booking_payment_collection WHERE id=$1',[posted.collectionId])).rows[0]).toEqual({environment:'MANUAL',method:'PAYMONGO',amount_centavos:'10000'});
 }finally{vi.stubEnv('PAYMONGO_MODE','test');vi.stubEnv('PAYMONGO_LIVE_ENABLED','false');vi.stubEnv('PAYMONGO_SECRET_KEY','sk_test_postingfixture123456');}
},60000);
it('keeps later provider mismatches visible as unresolved work even after an earlier collection posted',async()=>{
 const f=await fixture();await receive(f);await postCheckoutPayment(f.checkoutId);
 await db.query('UPDATE paymongo_checkout_state SET review_required=true WHERE checkout_id=$1',[f.checkoutId]);
 expect((await work(f.id)).unresolved).toBe(1);
 expect((await bookingCheckoutStatus(context.renter,f.id)).checkout).toMatchObject({status:'PAID_RECONCILIATION',checkoutUrl:null});
},60000);
it('supports restricted runtime posting while preserving immutable receipt links and the non-authenticatable audit principal',async()=>{
 const f=await fixture();await receive(f);const runtime=new Pool({connectionString:process.env.TEST_RUNTIME_DATABASE_URL,max:1}),connect=vi.spyOn(db,'connect').mockImplementation((()=>runtime.connect()) as typeof db.connect);
 try{
  expect(await postCheckoutPayment(f.checkoutId)).toMatchObject({outcome:'COLLECTED'});
  await expect(runtime.query("UPDATE paymongo_booking_posting SET outcome='CLOSED_LIABILITY' WHERE checkout_id=$1",[f.checkoutId])).rejects.toMatchObject({code:'42501'});
  await expect(runtime.query("UPDATE app_actor SET suspended=false WHERE id='system:paymongo-booking'")).rejects.toMatchObject({code:'P0001'});
 }finally{connect.mockRestore();await runtime.end();}
},60000);
