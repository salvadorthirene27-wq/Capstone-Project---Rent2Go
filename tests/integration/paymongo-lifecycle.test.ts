import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {Pool} from 'pg';
import {db} from '../../src/lib/db';
import {gatewayAgency,gatewayBooking} from '../helpers/gateway';
import {processCheckout,bookingCheckoutStatus} from '../../src/modules/gateway/checkout-lifecycle';
let context:Awaited<ReturnType<typeof gatewayAgency>>;
beforeAll(async()=>{
 vi.stubEnv('PAYMONGO_ENABLED','true');vi.stubEnv('PAYMONGO_MODE','test');vi.stubEnv('PAYMONGO_SECRET_KEY','sk_test_lifecyclefixture123456');vi.stubEnv('PAYMONGO_PAYMENT_METHODS','card,gcash');vi.stubEnv('PAYMONGO_NOTIFICATION_MODE','poll');vi.stubEnv('APP_ORIGIN','http://localhost:3100');
 context=await gatewayAgency();
},60000);
afterAll(async()=>{vi.unstubAllEnvs();await db.end();});
async function fixture(milliseconds=3600000){const f=await gatewayBooking(context,milliseconds);return {...f,row:(await db.query('SELECT * FROM paymongo_checkout WHERE id=$1',[f.checkoutId])).rows[0]};}
// Booking hold timestamps are intentionally immutable. Exercise their real PG
// deadline instead of bypassing that guard to manufacture a stale allocation.
async function waitForExpiry(hold:string){await db.query('SELECT pg_sleep(GREATEST(0,EXTRACT(epoch FROM (expires_at-clock_timestamp())))+0.05) FROM booking_hold WHERE id=$1',[hold]);}
function resource(f:Awaited<ReturnType<typeof fixture>>,paid=false,expired=false,paymentId=`pay_${f.checkoutId.replaceAll('-','')}`){
 const id=`cs_${f.checkoutId.replaceAll('-','')}`,a=f.row.payload.data.attributes;
 return {id,type:'checkout_session',attributes:{livemode:false,status:expired?'expired':'active',reference_number:f.checkoutId,checkout_url:`https://checkout.paymongo.com/${id}`,metadata:{rent2go_checkout:f.checkoutId},line_items:a.line_items,payments:paid?[{id:paymentId,attributes:{amount:10000,fee:500,net_amount:9500,currency:'PHP',status:'paid',livemode:false,source:{type:'card'},billing:{email:'must-not-be-stored@example.test'}}}]:[]}};
}
const compact=(s:ReturnType<typeof resource>)=>({id:s.id,type:s.type,attributes:{livemode:false,checkout_url:s.attributes.checkout_url}});
it('persists the minimal provider mapping before a failed retrieve and recovers with GET, never a second create',async()=>{
 const f=await fixture(),s=resource(f),broken=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({data:compact(s)})).mockRejectedValueOnce(new Error('SENSITIVE network detail'));
 expect(await processCheckout(f.checkoutId,{transport:broken})).toMatchObject({pending:true});
 expect((await db.query('SELECT provider_id FROM paymongo_checkout_link WHERE checkout_id=$1',[f.checkoutId])).rows[0].provider_id).toBe(s.id);
 const recover=vi.fn<typeof fetch>().mockImplementation(async()=>Response.json({data:resource(f,true)}));
 expect(await processCheckout(f.checkoutId,{transport:recover,force:true})).toMatchObject({paid:true});
 expect(recover.mock.calls.every(([,init])=>init?.method==='GET')).toBe(true);
 expect(await processCheckout(f.checkoutId,{transport:recover,force:true})).toMatchObject({paid:true});
 expect((await db.query('SELECT count(*) n FROM paymongo_checkout_payment WHERE checkout_id=$1',[f.checkoutId])).rows[0].n).toBe('1');
 expect((await db.query('SELECT count(*) n FROM booking_payment_collection WHERE request_id=$1',[f.id])).rows[0].n).toBe('0');
 const state=await bookingCheckoutStatus(context.renter,f.id);expect(state.checkout).toMatchObject({status:'PAID_PENDING_POSTING',checkoutUrl:null,payment:{amountCentavos:10000,feeCentavos:null}});
 expect(JSON.stringify(state)).not.toContain('must-not-be-stored');
},60000);
it('claims one dispatch lease while another worker is creating the same checkout',async()=>{
 const f=await fixture(),s=resource(f);let started!:()=>void,resume!:()=>void;
 const waiting=new Promise<void>(r=>started=r),release=new Promise<void>(r=>resume=r);
 const first=vi.fn<typeof fetch>().mockImplementationOnce(async()=>{started();await release;return Response.json({data:compact(s)});}).mockResolvedValue(Response.json({data:s}));
 const task=processCheckout(f.checkoutId,{transport:first});await waiting;
 try{const second=vi.fn<typeof fetch>();expect(await processCheckout(f.checkoutId,{transport:second,force:true})).toEqual({processed:false});expect(second).not.toHaveBeenCalled();}finally{resume();}
 await task;expect(first.mock.calls.filter(([,i])=>i?.method==='POST')).toHaveLength(1);
},60000);
it('records a verified late payment after hold expiry as a liability without reclaiming inventory',async()=>{
 const f=await fixture(15000),s=resource(f,true),transport=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({data:compact(s)})).mockImplementationOnce(async()=>{
  await waitForExpiry(f.hold);return Response.json({data:s});
 });
 expect(await processCheckout(f.checkoutId,{transport})).toMatchObject({paid:true});
 expect((await db.query('SELECT requires_reconciliation FROM paymongo_checkout_payment WHERE checkout_id=$1',[f.checkoutId])).rows[0].requires_reconciliation).toBe(true);
 expect((await db.query('SELECT 1 FROM booking_hold_commitment WHERE request_id=$1',[f.id])).rowCount).toBe(0);
 expect((await bookingCheckoutStatus(context.renter,f.id)).checkout?.status).toBe('PAID_RECONCILIATION');
},60000);
it('expires an unpaid changed source and uses a separate stable expiration key',async()=>{
 const f=await fixture(15000),active=resource(f),expired=resource(f,false,true);
 const transport=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({data:compact(active)})).mockImplementationOnce(async()=>{await waitForExpiry(f.hold);return Response.json({data:active});}).mockResolvedValueOnce(Response.json({data:expired}));
 expect(await processCheckout(f.checkoutId,{transport})).toMatchObject({expired:true});
 const posts=transport.mock.calls.filter(([,i])=>i?.method==='POST');expect(posts).toHaveLength(2);
 expect((posts[0][1]?.headers as Record<string,string>)['Idempotency-Key']).not.toBe((posts[1][1]?.headers as Record<string,string>)['Idempotency-Key']);
 expect((await bookingCheckoutStatus(context.renter,f.id)).checkout?.status).toBe('EXPIRED');
},60000);
it('does not interpret an expire400 with a processing payment as confirmed expiry',async()=>{
 const f=await fixture(15000),active=resource(f);
 const transport=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({data:compact(active)})).mockImplementationOnce(async()=>{await waitForExpiry(f.hold);return Response.json({data:active});}).mockResolvedValueOnce(Response.json({error:'processing'},{status:400})).mockResolvedValueOnce(Response.json({data:active}));
 expect(await processCheckout(f.checkoutId,{transport})).toMatchObject({pending:true});
 expect((await db.query('SELECT 1 FROM paymongo_checkout_end WHERE checkout_id=$1',[f.checkoutId])).rowCount).toBe(0);
 expect((await bookingCheckoutStatus(context.renter,f.id)).checkout?.checkoutUrl).toBeNull();
 expect((await bookingCheckoutStatus(context.renter,f.id)).checkout?.status).toBe('CLOSING');
},60000);
it('abandons an unavailable source before any outbound request and cannot revive it through forced recovery',async()=>{
 const f=await fixture(),transport=vi.fn<typeof fetch>();
 await db.query('UPDATE agency SET active=false WHERE id=$1',[context.agency]);
 try{
  await processCheckout(f.checkoutId,{transport});
  expect((await db.query('SELECT kind FROM paymongo_checkout_end WHERE checkout_id=$1',[f.checkoutId])).rows[0].kind).toBe('ABANDONED_BEFORE_DISPATCH');
 }finally{await db.query('UPDATE agency SET active=true WHERE id=$1',[context.agency]);}
 await processCheckout(f.checkoutId,{transport,force:true});expect(transport).not.toHaveBeenCalled();
},60000);
it('requires review outside the creation retry window and refuses a changed merchant without HTTP',async()=>{
 const f=await fixture(),transport=vi.fn<typeof fetch>();
 await db.query("INSERT INTO paymongo_checkout_state(checkout_id,first_dispatch_at)VALUES($1,clock_timestamp()-interval '21 hours')",[f.checkoutId]);
 await processCheckout(f.checkoutId,{transport});expect(transport).not.toHaveBeenCalled();
 expect((await bookingCheckoutStatus(context.renter,f.id)).checkout?.status).toBe('REVIEW_REQUIRED');
 vi.stubEnv('PAYMONGO_SECRET_KEY','sk_test_differentmerchant123456');
 try{await expect(processCheckout(f.checkoutId,{transport})).rejects.toMatchObject({status:409});}finally{vi.stubEnv('PAYMONGO_SECRET_KEY','sk_test_lifecyclefixture123456');}
 expect(transport).not.toHaveBeenCalled();
},60000);
it('quarantines mismatched references and forbids reuse of the same provider payment on another booking',async()=>{
 const a=await fixture(),b=await fixture(),sa=resource(a,true,false,'pay_sharedfixture'),sb=resource(b,true,false,'pay_sharedfixture');
 const ta=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({data:compact(sa)})).mockResolvedValueOnce(Response.json({data:sa}));await processCheckout(a.checkoutId,{transport:ta});
 const tb=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({data:compact(sb)})).mockResolvedValueOnce(Response.json({data:sb}));expect(await processCheckout(b.checkoutId,{transport:tb})).toMatchObject({requiresReview:true});
 expect((await db.query('SELECT 1 FROM paymongo_checkout_payment WHERE checkout_id=$1',[b.checkoutId])).rowCount).toBe(0);
 const c=await fixture(),sc=resource(c);sc.attributes.reference_number=a.checkoutId;
 const tc=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({data:compact(sc)})).mockResolvedValueOnce(Response.json({data:sc}));expect(await processCheckout(c.checkoutId,{transport:tc})).toMatchObject({requiresReview:true});
 await expect(bookingCheckoutStatus(context.foreign,a.id)).rejects.toMatchObject({status:404});
},60000);
it('works with restricted runtime grants and preserves immutable payment evidence and dispatch identity',async()=>{
 const f=await fixture(),s=resource(f,true),runtime=new Pool({connectionString:process.env.TEST_RUNTIME_DATABASE_URL,max:1}),connect=vi.spyOn(db,'connect').mockImplementation((()=>runtime.connect()) as typeof db.connect);
 try{
  const transport=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({data:compact(s)})).mockResolvedValueOnce(Response.json({data:s}));expect(await processCheckout(f.checkoutId,{transport})).toMatchObject({paid:true});
  await expect(runtime.query('UPDATE paymongo_checkout_payment SET fee_centavos=0 WHERE checkout_id=$1',[f.checkoutId])).rejects.toMatchObject({code:'42501'});
  await expect(runtime.query("UPDATE paymongo_checkout_state SET first_dispatch_at=clock_timestamp()-interval '30 hours' WHERE checkout_id=$1",[f.checkoutId])).rejects.toMatchObject({code:'23514'});
 }finally{connect.mockRestore();await runtime.end();}
},60000);
