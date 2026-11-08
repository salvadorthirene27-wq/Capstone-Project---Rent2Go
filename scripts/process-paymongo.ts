import {randomUUID} from 'node:crypto';
import {paymentWorkerTarget} from './lib/payment-worker-target';
process.env.DATABASE_URL=paymentWorkerTarget(process.env,process.argv.slice(2));
const {db}=await import('../src/lib/db');
const {claimWorker,runWorkerBatch,releaseWorker}=await import('../src/modules/operations/worker');
const {runCheckoutBatch,checkoutWorkerName}=await import('../src/modules/gateway/checkout-worker');
const instanceId=randomUUID();let claimed=false,stopping=false,wake:(()=>void)|undefined;
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{stopping=true;wake?.();});
try{
 if(!(await db.query("SELECT 1 FROM pg_constraint WHERE conrelid='background_worker'::regclass AND pg_get_constraintdef(oid) LIKE '%PAYMONGO_CHECKOUT_SYNC%'")).rowCount)throw Error('Apply payment worker migration before starting.');
 claimed=await claimWorker(instanceId,checkoutWorkerName);
 if(!claimed)console.info('Another payment status worker owns the lease.');
 else{
  console.info('Payment status worker started (15 seconds).');
  while(!stopping){
   try{
    const result=await runWorkerBatch(instanceId,checkoutWorkerName,()=>runCheckoutBatch());
    if(!result.owned){console.info('Payment status worker lease was lost; stopping.');break;}
    if(result.errorType){console.error('Payment status batch failed',{type:result.errorType});if(process.argv.includes('--once'))process.exitCode=1;}
    else if(result.processed)console.info('Payment status jobs inspected',{count:result.processed});
   }catch{console.error('Payment status batch failed',{type:'Error'});if(process.argv.includes('--once'))process.exitCode=1;}
   if(process.argv.includes('--once'))break;
   if(!stopping)await new Promise<void>(resolve=>{const timer=setTimeout(()=>{wake=undefined;resolve();},15000);wake=()=>{clearTimeout(timer);wake=undefined;resolve();};});
  }
 }
}finally{if(claimed)await releaseWorker(instanceId,checkoutWorkerName).catch(()=>{});await db.end();console.info('Payment status worker stopped.');}
