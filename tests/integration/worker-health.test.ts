import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {db} from '../../src/lib/db';
import {claimHoldWorker,runHoldWorkerBatch,releaseHoldWorker} from '../../src/modules/operations/worker';
import {getOperations} from '../../src/modules/operations/service';
const first=randomUUID(),second=randomUUID(),admin={id:randomUUID(),role:'SUPER_ADMIN' as const},renter={id:randomUUID(),role:'RENTER' as const};let winner:string;
beforeAll(async()=>{
 if(new URL(process.env.DATABASE_URL!).pathname!=='/rent2go_test')throw Error('Isolated database required.');
 for(const u of [admin,renter])await db.query("INSERT INTO app_actor(id,email,name,role)VALUES($1,$2,'Synthetic worker reviewer',$3)",[u.id,`${u.id}@example.test`,u.role]);
 await db.query("UPDATE background_worker SET status='STOPPED',lease_until=clock_timestamp() WHERE name='BOOKING_HOLD_EXPIRY'");
});
afterAll(async()=>{if(winner)await releaseHoldWorker(winner);await db.end();});
it('allows only one concurrent launcher and records successful work under the restricted runtime role',async()=>{
 const runtime=new Pool({connectionString:process.env.TEST_RUNTIME_DATABASE_URL,max:3}),spy=vi.spyOn(db,'connect').mockImplementation(()=>runtime.connect() as any);
 try{const claims=await Promise.all([claimHoldWorker(first),claimHoldWorker(second)]);expect(claims.filter(Boolean)).toHaveLength(1);winner=claims[0]?first:second;expect(await claimHoldWorker(winner)).toBe(false);const result=await runHoldWorkerBatch(winner,async()=>2);expect(result).toEqual({owned:true,processed:2,errorType:null});const health=await getOperations(admin);expect(health.holdExpiry).toMatchObject({state:'RUNNING',lastProcessed:2});expect(health.history[0]).toMatchObject({outcome:'SUCCEEDED',processed:2,errorType:null});await expect(runtime.query("UPDATE background_worker_run SET processed=100")).rejects.toMatchObject({code:'42501'});}finally{spy.mockRestore();await runtime.end();}
});
it('keeps failures observable without recording exception text or claiming a complete release count',async()=>{
 const result=await runHoldWorkerBatch(winner,async()=>{throw new TypeError('SENSITIVE EXCEPTION CONTENT MUST NEVER BE STORED');});expect(result).toEqual({owned:true,processed:null,errorType:'TypeError'});const health=await getOperations(admin);expect(health.holdExpiry).toMatchObject({state:'NEEDS_ATTENTION',lastProcessed:null,lastErrorType:'TypeError'});expect(JSON.stringify(health)).not.toContain('SENSITIVE');expect(health.history[0]).toMatchObject({outcome:'FAILED',processed:null});await runHoldWorkerBatch(winner,async()=>0);expect((await getOperations(admin)).holdExpiry.state).toBe('RUNNING');
});
it('does not permit takeover while an active connected batch owns the coordination row, even as its lease ages',async()=>{
 await db.query("UPDATE background_worker SET lease_until=clock_timestamp()+interval '1 second' WHERE name='BOOKING_HOLD_EXPIRY'");let entered!:()=>void,finish!:()=>void;const started=new Promise<void>(r=>{entered=r;}),gate=new Promise<void>(r=>{finish=r;});const batch=runHoldWorkerBatch(winner,async()=>{entered();await gate;return 0;});await started;
 try{await new Promise(r=>setTimeout(r,1100));expect(await claimHoldWorker(winner===first?second:first)).toBe(false);}finally{finish();await batch;}
 expect((await getOperations(admin)).holdExpiry.state).toBe('RUNNING');
},15000);
it('allows recovery after an expired lease and fences the earlier instance from release or another batch',async()=>{
 const old=winner;await db.query("UPDATE background_worker SET lease_until=clock_timestamp()-interval '1 second' WHERE name='BOOKING_HOLD_EXPIRY'");expect((await getOperations(admin)).holdExpiry.state).toBe('STALE');winner=old===first?second:first;expect(await claimHoldWorker(winner)).toBe(true);expect((await getOperations(admin)).holdExpiry.state).toBe('STARTING');const callback=vi.fn(async()=>0);expect((await runHoldWorkerBatch(old,callback)).owned).toBe(false);expect(callback).not.toHaveBeenCalled();expect(await releaseHoldWorker(old)).toBe(false);expect((await runHoldWorkerBatch(winner,async()=>0)).owned).toBe(true);
});
it('keeps operational history restricted and omits internal instance and connection identifiers',async()=>{
 await expect(getOperations(renter)).rejects.toMatchObject({status:403});const h=await getOperations(admin);expect(JSON.stringify(h)).not.toContain(winner);expect(JSON.stringify(h)).not.toContain('instance_id');expect(h.databaseReachable).toBe(true);expect(h.history.length).toBeGreaterThan(0);await expect(db.query("UPDATE background_worker_run SET processed=100")).rejects.toThrow(/immutable/);await releaseHoldWorker(winner);expect((await getOperations(admin)).holdExpiry.state).toBe('STOPPED');
});
