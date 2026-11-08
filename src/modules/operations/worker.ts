import {randomUUID} from 'node:crypto';
import {db,transaction} from '../../lib/db';
export type ManagedWorkerName='BOOKING_HOLD_EXPIRY'|'PAYMONGO_CHECKOUT_SYNC';
const expiryName:ManagedWorkerName='BOOKING_HOLD_EXPIRY';
const valid=(id:string,name:ManagedWorkerName)=>{if(!['BOOKING_HOLD_EXPIRY','PAYMONGO_CHECKOUT_SYNC'].includes(name)||!/^[a-f0-9-]{36}$/i.test(id))throw Error('Invalid worker instance.');};
export async function claimWorker(instanceId:string,name:ManagedWorkerName){
 valid(instanceId,name);
 try{return await transaction(async c=>{
  await c.query("SET LOCAL lock_timeout='2s'");
  return Boolean((await c.query(`INSERT INTO background_worker(name,instance_id,status,lease_until)VALUES($1,$2,'RUNNING',clock_timestamp()+interval '90 seconds') ON CONFLICT(name) DO UPDATE SET instance_id=excluded.instance_id,status='RUNNING',lease_until=clock_timestamp()+interval '90 seconds',started_at=clock_timestamp(),last_seen_at=clock_timestamp() WHERE background_worker.lease_until<=clock_timestamp() RETURNING name`,[name,instanceId])).rowCount);
 });}catch(e){if((e as {code?:string}).code==='55P03')return false;throw e;}
}
/** Hold the coordination row throughout the batch. A replacement cannot start
 * even if the displayed lease ages while this connected batch is still running.
 * Booking-level SKIP LOCKED/idempotent expiry remains the final safety boundary
 * if a control connection is lost while a separate booking transaction finishes. */
export async function runWorkerBatch(instanceId:string,name:ManagedWorkerName,batch:()=>Promise<number>){
 valid(instanceId,name);
 return transaction(async c=>{
  const row=(await c.query('SELECT instance_id,lease_until>clock_timestamp() live,clock_timestamp() started FROM background_worker WHERE name=$1 FOR UPDATE',[name])).rows[0];
  if(!row||row.instance_id!==instanceId||!row.live)return {owned:false,processed:0,errorType:null};
  let processed:number|null=0,errorType:string|null=null;
  try{processed=await batch();if(!Number.isInteger(processed)||processed<0||processed>100)throw Error('Invalid expiry batch result.');}
  catch(e){const type=e instanceof Error?e.name:'Error';errorType=/^[A-Za-z][A-Za-z0-9]{0,59}$/.test(type)?type:'Error';processed=null;}
  await c.query(`UPDATE background_worker SET last_seen_at=clock_timestamp(),lease_until=clock_timestamp()+interval '90 seconds',last_processed=$3,last_success_at=CASE WHEN $4::text IS NULL THEN clock_timestamp() ELSE last_success_at END,last_failure_at=CASE WHEN $4::text IS NOT NULL THEN clock_timestamp() ELSE last_failure_at END,last_error_type=$4 WHERE name=$1 AND instance_id=$2`,[name,instanceId,processed,errorType]);
  await c.query('INSERT INTO background_worker_run(id,worker_name,instance_id,outcome,processed,error_type,started_at)VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),name,instanceId,errorType?'FAILED':'SUCCEEDED',processed,errorType,row.started]);
  return {owned:true,processed,errorType};
 });
}
export async function releaseWorker(instanceId:string,name:ManagedWorkerName){
 valid(instanceId,name);return Boolean((await db.query("UPDATE background_worker SET status='STOPPED',lease_until=clock_timestamp(),last_seen_at=clock_timestamp() WHERE name=$1 AND instance_id=$2",[name,instanceId])).rowCount);
}

// Existing callers retain the same expiry-worker contract.
export const claimHoldWorker=(id:string)=>claimWorker(id,expiryName);
export const runHoldWorkerBatch=(id:string,batch:()=>Promise<number>)=>runWorkerBatch(id,expiryName,batch);
export const releaseHoldWorker=(id:string)=>releaseWorker(id,expiryName);
