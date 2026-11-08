import {afterAll,beforeAll,beforeEach,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {db} from '../../src/lib/db';
import {gatewayAgency,gatewayBooking} from '../helpers/gateway';
import {runCheckoutBatch,checkoutWorkerName} from '../../src/modules/gateway/checkout-worker';
import {processCheckout} from '../../src/modules/gateway/checkout-lifecycle';
import {claimWorker,runWorkerBatch,releaseWorker} from '../../src/modules/operations/worker';
let context:Awaited<ReturnType<typeof gatewayAgency>>;
beforeAll(async()=>{
 if(!process.env.TEST_DATABASE_URL||process.env.NEON_PROJECT_ID!=='floral-flower-08375841')throw Error('Use isolated test database.');
 vi.stubEnv('PAYMONGO_ENABLED','true');vi.stubEnv('PAYMONGO_MODE','test');vi.stubEnv('PAYMONGO_PAYMENT_METHODS','card,gcash');vi.stubEnv('PAYMONGO_NOTIFICATION_MODE','poll');vi.stubEnv('APP_ORIGIN','http://localhost:3100');
 context=await gatewayAgency();
},60000);
beforeEach(()=>vi.stubEnv('PAYMONGO_SECRET_KEY','sk_test_worker'+randomUUID().replaceAll('-','')));
afterAll(async()=>{vi.unstubAllEnvs();await db.end();});
async function fixture(){const f=await gatewayBooking(context);return {...f,row:(await db.query('SELECT * FROM paymongo_checkout WHERE id=$1',[f.checkoutId])).rows[0]};}
function resource(f:Awaited<ReturnType<typeof fixture>>,paid=true){const id='cs_'+f.checkoutId.replaceAll('-','');return {id,type:'checkout_session',attributes:{livemode:false,status:'active',reference_number:f.checkoutId,checkout_url:'https://checkout.paymongo.com/'+id,metadata:{rent2go_checkout:f.checkoutId},line_items:f.row.payload.data.attributes.line_items,payments:paid?[{id:'pay_'+f.checkoutId.replaceAll('-',''),attributes:{amount:10000,fee:500,net_amount:9500,currency:'PHP',status:'paid',livemode:false,source:{type:'card'}}}]:[]}};}
function transport(f:Awaited<ReturnType<typeof fixture>>,paid=true){const s=resource(f,paid);return vi.fn<typeof fetch>(async(_url,init)=>Response.json({data:init?.method==='POST'?{id:s.id,type:s.type,attributes:{livemode:false,checkout_url:s.attributes.checkout_url}}:s}));}
async function due(id:string){await db.query("UPDATE paymongo_checkout_state SET next_poll_at=clock_timestamp()-interval '1 second' WHERE checkout_id=$1",[id]);}
it('prepares, verifies and posts once, then repeats without provider calls or duplicate collections',async()=>{
 const f=await fixture(),http=transport(f);
 expect(await runCheckoutBatch(5,{transport:http})).toBe(1);
 expect((await db.query('SELECT count(*)::int n FROM booking_payment_collection WHERE request_id=$1',[f.id])).rows[0].n).toBe(1);
 const never=vi.fn<typeof fetch>();expect(await runCheckoutBatch(5,{transport:never})).toBe(0);expect(never).not.toHaveBeenCalled();
 expect((await db.query('SELECT count(*)::int n FROM paymongo_booking_posting WHERE checkout_id=$1',[f.checkoutId])).rows[0].n).toBe(1);
},60000);
it('recovers a durable paid receipt after a crash before posting without asking the provider again',async()=>{
 const f=await fixture();await processCheckout(f.checkoutId,{transport:transport(f)});await due(f.checkoutId);
 const never=vi.fn<typeof fetch>();expect(await runCheckoutBatch(5,{transport:never})).toBe(1);expect(never).not.toHaveBeenCalled();
 expect((await db.query('SELECT outcome FROM paymongo_booking_posting WHERE checkout_id=$1',[f.checkoutId])).rows[0].outcome).toBe('COLLECTED');
},60000);
it('backs off ambiguous network results and never dispatches during cooldown',async()=>{
 const f=await fixture(),broken=vi.fn<typeof fetch>().mockRejectedValue(Error('SENSITIVE provider failure'));
 await expect(runCheckoutBatch(5,{transport:broken})).rejects.toMatchObject({name:'PayMongoBatchError'});
 expect(broken).toHaveBeenCalledTimes(1);expect(await runCheckoutBatch(5,{transport:broken})).toBe(0);expect(broken).toHaveBeenCalledTimes(1);
 expect((await db.query('SELECT first_dispatch_at,last_error FROM paymongo_checkout_state WHERE checkout_id=$1',[f.checkoutId])).rows[0].last_error).toBe('PROVIDER_UNAVAILABLE');
},60000);
it('filters other merchant keys and stops all dispatch when payments are disabled',async()=>{
 const f=await fixture(),never=vi.fn<typeof fetch>();const secret=process.env.PAYMONGO_SECRET_KEY!;
 vi.stubEnv('PAYMONGO_SECRET_KEY','sk_test_foreignWorkerFixture');expect(await runCheckoutBatch(5,{transport:never})).toBe(0);
 vi.stubEnv('PAYMONGO_SECRET_KEY',secret);vi.stubEnv('PAYMONGO_ENABLED','false');try{await expect(runCheckoutBatch(5,{transport:never})).rejects.toThrow();}finally{vi.stubEnv('PAYMONGO_ENABLED','true');}
 expect(never).not.toHaveBeenCalled();expect((await db.query('SELECT 1 FROM paymongo_checkout_link WHERE checkout_id=$1',[f.checkoutId])).rowCount).toBe(0);
},60000);
it('coordinates one leased worker, records sanitized failure and success, and releases explicitly',async()=>{
 const first=randomUUID(),second=randomUUID();expect(await claimWorker(first,checkoutWorkerName)).toBe(true);
 try{
  let started!:()=>void,resume!:()=>void;const waiting=new Promise<void>(r=>started=r),release=new Promise<void>(r=>resume=r);
  const running=runWorkerBatch(first,checkoutWorkerName,async()=>{started();await release;return 0;});await waiting;
  try{expect(await claimWorker(second,checkoutWorkerName)).toBe(false);}finally{resume();}
  expect(await running).toMatchObject({owned:true,processed:0,errorType:null});
  expect(await runWorkerBatch(first,checkoutWorkerName,async()=>{throw Error('SENSITIVE private body');})).toMatchObject({owned:true,errorType:'Error'});
  const history=(await db.query('SELECT outcome,error_type FROM background_worker_run WHERE instance_id=$1 ORDER BY completed_at',[first])).rows;
  expect(history.map(r=>r.outcome)).toEqual(['SUCCEEDED','FAILED']);expect(JSON.stringify(history)).not.toContain('SENSITIVE');
 }finally{await releaseWorker(first,checkoutWorkerName);}
 expect(await claimWorker(second,checkoutWorkerName)).toBe(true);await releaseWorker(second,checkoutWorkerName);
},60000);
it('allows the restricted application role to read and supervise only known workers',async()=>{
 const runtime=new Pool({connectionString:process.env.TEST_RUNTIME_DATABASE_URL});try{
  const id=randomUUID();await runtime.query("INSERT INTO background_worker(name,instance_id,status,lease_until)VALUES('PAYMONGO_CHECKOUT_SYNC',$1,'STOPPED',clock_timestamp()) ON CONFLICT(name) DO UPDATE SET instance_id=excluded.instance_id,status='STOPPED',lease_until=clock_timestamp()",[id]);
  expect((await runtime.query("SELECT status FROM background_worker WHERE name='PAYMONGO_CHECKOUT_SYNC'")).rows[0].status).toBe('STOPPED');
  await expect(runtime.query("INSERT INTO background_worker(name,instance_id,status,lease_until)VALUES('ARBITRARY_WORKER',$1,'RUNNING',clock_timestamp())",[randomUUID()])).rejects.toMatchObject({code:'23514'});
 }finally{await runtime.end();}
},60000);
