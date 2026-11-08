import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {randomUUID,createHmac} from 'node:crypto';
import {Pool} from 'pg';
import {db,transaction} from '../../src/lib/db';
import {gatewayAgency,gatewayBooking} from '../helpers/gateway';
import {processCheckout,bookingCheckoutStatus} from '../../src/modules/gateway/checkout-lifecycle';
import {postCheckoutPayment} from '../../src/modules/gateway/booking-posting';
import {gatewayBookingWork} from '../../src/modules/gateway/booking-guard';
import {receivePayMongoNotification,processNotificationBatch} from '../../src/modules/gateway/notifications';
import {getPaymentReconciliation} from '../../src/modules/gateway/reconciliation';
import {runCheckoutBatch} from '../../src/modules/gateway/checkout-worker';
let context:Awaited<ReturnType<typeof gatewayAgency>>;
const signing='synthetic-notification-signature-secret';
beforeAll(async()=>{
 if(new URL(process.env.DATABASE_URL!).pathname!=='/rent2go_test'||process.env.NEON_PROJECT_ID!=='floral-flower-08375841')throw Error('Use isolated test database.');
 vi.stubEnv('PAYMONGO_ENABLED','true');vi.stubEnv('PAYMONGO_MODE','test');vi.stubEnv('PAYMONGO_NOTIFICATION_MODE','webhook');vi.stubEnv('PAYMONGO_WEBHOOK_SECRET',signing);vi.stubEnv('PAYMONGO_PAYMENT_METHODS','card,gcash');vi.stubEnv('APP_ORIGIN','http://localhost:3100');
 context=await gatewayAgency();
},60000);
beforeEach(()=>vi.stubEnv('PAYMONGO_SECRET_KEY','sk_test_notification'+randomUUID().replaceAll('-','')));
afterAll(async()=>{vi.unstubAllEnvs();await db.end();});
async function fixture(ms=3600000){const f=await gatewayBooking(context,ms);return {...f,row:(await db.query('SELECT * FROM paymongo_checkout WHERE id=$1',[f.checkoutId])).rows[0]};}
function resource(f:Awaited<ReturnType<typeof fixture>>,paid=true){const id='cs_'+f.checkoutId.replaceAll('-','');return {id,type:'checkout_session',attributes:{livemode:false,status:'active',reference_number:f.checkoutId,checkout_url:'https://checkout.paymongo.com/'+id,metadata:{rent2go_checkout:f.checkoutId,extra:'SENSITIVE metadata'},line_items:f.row.payload.data.attributes.line_items,payments:paid?[{id:'pay_'+f.checkoutId.replaceAll('-',''),attributes:{amount:10000,fee:500,net_amount:9500,currency:'PHP',status:'paid',livemode:false,source:{type:'card'},billing:{email:'SENSITIVE billing'}}}]:[]}};}
async function link(f:Awaited<ReturnType<typeof fixture>>){const s=resource(f,false);await processCheckout(f.checkoutId,{transport:vi.fn<typeof fetch>().mockImplementation(async(_u,i)=>Response.json({data:i?.method==='POST'?{id:s.id,type:s.type,attributes:{livemode:false,checkout_url:s.attributes.checkout_url}}:s}))});}
function event(s:unknown,id='evt_'+randomUUID().replaceAll('-','')){return {data:{id,type:'event',attributes:{type:'checkout_session.payment.paid',livemode:false,data:s}}};}
async function signed(value:unknown,delta=0){const raw=Buffer.from(JSON.stringify(value)),now=(await db.query('SELECT extract(epoch from clock_timestamp()) n')).rows[0].n,t=Math.floor(Number(now))+delta;return {raw,signature:`t=${t},te=${createHmac('sha256',signing).update(t+'.').update(raw).digest('hex')},li=`};}
async function deliver(value:unknown,delta=0){const s=await signed(value,delta);return receivePayMongoNotification(s.raw,s.signature);}
const work=(id:string)=>transaction(c=>gatewayBookingWork(c,id));
it('commits authenticated facts before booking posting and recovers once without extra provider calls',async()=>{
 const f=await fixture();await link(f);const e=event(resource(f));
 expect(await deliver(e)).toEqual({received:true});expect((await db.query('SELECT 1 FROM paymongo_checkout_payment WHERE checkout_id=$1',[f.checkoutId])).rowCount).toBe(0);
 expect(await processNotificationBatch()).toBe(1);expect((await db.query('SELECT 1 FROM paymongo_checkout_payment WHERE checkout_id=$1',[f.checkoutId])).rowCount).toBe(1);expect((await db.query('SELECT 1 FROM booking_payment_collection WHERE request_id=$1',[f.id])).rowCount).toBe(0);
 const never=vi.fn<typeof fetch>();expect(await runCheckoutBatch(5,{transport:never})).toBe(1);expect(never).not.toHaveBeenCalled();expect((await bookingCheckoutStatus(context.renter,f.id)).checkout?.status).toBe('PAID');
 await deliver(e);expect(await processNotificationBatch()).toBe(0);expect((await db.query('SELECT count(*)::int n FROM booking_payment_collection WHERE request_id=$1',[f.id])).rows[0].n).toBe(1);
 const stored=(await db.query('SELECT projection FROM paymongo_notification WHERE checkout_id=$1',[f.checkoutId])).rows[0].projection;expect(JSON.stringify(stored)).not.toContain('SENSITIVE');
},60000);
it('deduplicates concurrent deliveries and semantically identical billing/metadata changes',async()=>{
 const f=await fixture();await link(f);const e=event(resource(f));await Promise.all([deliver(e),deliver(e)]);
 const changed=structuredClone(e);(changed.data.attributes.data as any).attributes.payments[0].attributes.billing.email='Different ignored billing';await deliver(changed);
 expect((await db.query('SELECT count(*)::int n FROM paymongo_notification WHERE checkout_id=$1',[f.checkoutId])).rows[0].n).toBe(1);
 expect((await db.query('SELECT count(*)::int n FROM paymongo_notification_conflict f JOIN paymongo_notification n ON n.id=f.notification_id WHERE n.checkout_id=$1',[f.checkoutId])).rows[0].n).toBe(0);
 expect(await processNotificationBatch()).toBe(1);
},60000);
it('rejects tampering, stale timestamps, wrong modes and disabled webhook reception',async()=>{
 const f=await fixture();await link(f);const e=event(resource(f)),s=await signed(e);
 await expect(receivePayMongoNotification(Buffer.from(JSON.stringify({...e,changed:true})),s.signature)).rejects.toMatchObject({status:401});await expect(deliver(e,-601)).rejects.toMatchObject({status:401});
 await expect(deliver({...e,data:{...e.data,attributes:{...e.data.attributes,livemode:true}}})).rejects.toMatchObject({status:400});
 vi.stubEnv('PAYMONGO_NOTIFICATION_MODE','poll');try{await expect(deliver(e)).rejects.toMatchObject({status:503});}finally{vi.stubEnv('PAYMONGO_NOTIFICATION_MODE','webhook');}
 expect((await db.query('SELECT 1 FROM paymongo_notification WHERE checkout_id=$1',[f.checkoutId])).rowCount).toBe(0);
},60000);
it('quarantines changed facts under one event id after posting without rewriting the original collection',async()=>{
 const f=await fixture();await link(f);const e=event(resource(f));await deliver(e);await runCheckoutBatch(5,{transport:vi.fn<typeof fetch>()});
 const before=(await db.query('SELECT * FROM booking_payment_collection WHERE request_id=$1',[f.id])).rows;
 const changed=structuredClone(e);(changed.data.attributes.data as any).attributes.payments[0].id='pay_conflicting'+randomUUID().replaceAll('-','');await deliver(changed);
 expect((await work(f.id)).unresolved).toBe(1);expect((await bookingCheckoutStatus(context.renter,f.id)).checkout?.status).toBe('PAID_RECONCILIATION');expect((await db.query('SELECT * FROM booking_payment_collection WHERE request_id=$1',[f.id])).rows).toEqual(before);
},60000);
it('retains unmatched and invalid paid events for review and never turns them into paid bookings',async()=>{
 const f=await fixture();await link(f);const unknown=resource(f);unknown.id='cs_unmatched'+randomUUID().replaceAll('-','');unknown.attributes.checkout_url='https://checkout.paymongo.com/'+unknown.id;await deliver(event(unknown));
 const invalid=resource(f);delete (invalid.attributes.payments[0].attributes as any).fee;await deliver(event(invalid));expect(await processNotificationBatch()).toBe(2);
 const outcomes=(await db.query('SELECT outcome FROM paymongo_notification_result r JOIN paymongo_notification n ON n.id=r.notification_id WHERE n.provider_id=ANY($1::text[])',[[unknown.id,resource(f).id]])).rows.map(r=>r.outcome);expect(outcomes).toContain('UNMATCHED');expect(outcomes).toContain('INVALID_PAYLOAD');
 expect((await db.query('SELECT 1 FROM paymongo_checkout_payment WHERE checkout_id=$1',[f.checkoutId])).rowCount).toBe(0);expect((await work(f.id)).unresolved).toBe(1);
},60000);
it('blocks posting while a linked notification is pending, then quarantines an amount mismatch',async()=>{
 const f=await fixture();await link(f);const first=event(resource(f));await deliver(first);await processNotificationBatch();
 const wrong=resource(f);wrong.attributes.line_items=[{amount:10001,quantity:1,currency:'PHP'}] as any;wrong.attributes.payments[0].attributes.amount=10001;wrong.attributes.payments[0].attributes.net_amount=9501;await deliver(event(wrong));
 expect(await postCheckoutPayment(f.checkoutId)).toEqual({posted:false});await processNotificationBatch();expect((await work(f.id)).unresolved).toBe(1);
 const result=await postCheckoutPayment(f.checkoutId);expect(result.posted).toBe(true);expect((await db.query('SELECT requires_reconciliation FROM booking_payment_collection WHERE request_id=$1',[f.id])).rows[0].requires_reconciliation).toBe(true);expect((await db.query('SELECT 1 FROM booking_hold_commitment WHERE request_id=$1',[f.id])).rowCount).toBe(0);
},60000);
it('recognizes a mapping saved after notification arrival and preserves late funds without reclaiming expired stock',async()=>{
 const f=await fixture(15000);await deliver(event(resource(f)));await link(f);
 await db.query("SELECT pg_sleep(GREATEST(0,extract(epoch from (expires_at-clock_timestamp())))+0.05) FROM booking_hold WHERE id=$1",[f.hold]);
 await processNotificationBatch();expect((await db.query('SELECT r.checkout_id FROM paymongo_notification_result r JOIN paymongo_notification n ON n.id=r.notification_id WHERE n.provider_id=$1',[resource(f).id])).rows[0].checkout_id).toBe(f.checkoutId);
 const posted=await postCheckoutPayment(f.checkoutId);expect(posted.posted).toBe(true);expect((await db.query('SELECT 1 FROM booking_hold_commitment WHERE request_id=$1',[f.id])).rowCount).toBe(0);expect((await bookingCheckoutStatus(context.renter,f.id)).checkout?.status).toBe('PAID_RECONCILIATION');
},60000);
it('processes signatures and receipts with runtime permissions while preserving immutable inbox history',async()=>{
 const f=await fixture();await link(f);const e=event(resource(f)),s=await signed(e),runtime=new Pool({connectionString:process.env.TEST_RUNTIME_DATABASE_URL,max:2}),connect=vi.spyOn(db,'connect').mockImplementation((()=>runtime.connect()) as typeof db.connect),query=vi.spyOn(db,'query').mockImplementation(runtime.query.bind(runtime) as typeof db.query);
 try{await receivePayMongoNotification(s.raw,s.signature);await processNotificationBatch();expect((await db.query('SELECT 1 FROM paymongo_checkout_payment WHERE checkout_id=$1',[f.checkoutId])).rowCount).toBe(1);await expect(runtime.query("UPDATE paymongo_notification SET kind='IGNORED'")).rejects.toMatchObject({code:'42501'});}finally{query.mockRestore();connect.mockRestore();await runtime.end();}
},60000);

it('exposes scoped review cases only to an active nonfixture Super Admin and keeps amount provenance explicit',async()=>{
 const f=await fixture();await link(f);const bad=resource(f);delete (bad.attributes.payments[0].attributes as any).fee;await deliver(event(bad));await processNotificationBatch();
 for(const a of [context.renter,context.operator,context.foreign])await expect(getPaymentReconciliation(a,{reference:f.id})).rejects.toMatchObject({status:403});
 const data=await getPaymentReconciliation(context.reviewer,{reference:f.id});expect(data.total).toBe(1);expect(data.items[0]).toMatchObject({kind:'CHECKOUT',requestId:f.id,mode:'test',amountKind:'EXPECTED',amountCentavos:10000});expect(JSON.stringify(data)).not.toMatch(/SENSITIVE|merchant_fingerprint|checkout_url|signature|billing/);
 expect((await getPaymentReconciliation(context.reviewer,{reference:f.id,mode:'live'})).total).toBe(0);
 await db.query('UPDATE app_actor SET is_test_fixture=true WHERE id=$1',[context.reviewer.id]);try{await expect(getPaymentReconciliation(context.reviewer)).rejects.toMatchObject({status:403});}finally{await db.query('UPDATE app_actor SET is_test_fixture=false WHERE id=$1',[context.reviewer.id]);}
},60000);
it('retains an old-key notification without dispatching it into another merchant namespace and ignores unrelated event types',async()=>{
 const f=await fixture();await link(f);const key=process.env.PAYMONGO_SECRET_KEY!;
 vi.stubEnv('PAYMONGO_SECRET_KEY','sk_test_changedMerchantFixture');try{
  const e=event(resource(f));await deliver(e);expect(await processNotificationBatch()).toBe(1);const data=await getPaymentReconciliation(context.reviewer,{reference:e.data.id});expect(data.items[0]).toMatchObject({kind:'NOTIFICATION',reason:'UNMATCHED',amountKind:'DECLARED'});
  const unrelated={data:{id:'evt_'+randomUUID().replaceAll('-',''),type:'event',attributes:{type:'payment.failed',livemode:false,data:{private:'SENSITIVE ignored'}}}};await deliver(unrelated);await processNotificationBatch();expect((await getPaymentReconciliation(context.reviewer,{reference:unrelated.data.id})).total).toBe(0);
 }finally{vi.stubEnv('PAYMONGO_SECRET_KEY',key);}
 expect((await db.query('SELECT 1 FROM paymongo_checkout_payment WHERE checkout_id=$1',[f.checkoutId])).rowCount).toBe(0);
},60000);
