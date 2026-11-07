import { bookingWorkerTarget } from "./lib/booking-worker-target";
import {randomUUID} from 'node:crypto';
// Deliberately opt in: this worker must never silently target an old project.
process.env.DATABASE_URL = bookingWorkerTarget(process.env, process.argv.slice(2));
const { db } = await import("../src/lib/db");
const { expireBookingHolds } = await import("../src/modules/bookings/quotation");
const {claimHoldWorker,runHoldWorkerBatch,releaseHoldWorker}=await import('../src/modules/operations/worker');
const instanceId=randomUUID();let claimed=false;
let stopping = false;
let wake: (() => void) | undefined;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => { stopping = true; wake?.(); });
try {
  const schema = (await db.query("SELECT to_regclass('booking_hold') AS table_name")).rows[0];
  if (!schema.table_name)
    throw new Error("Apply quotation migration before starting the worker.");
  claimed=await claimHoldWorker(instanceId);
  if(!claimed){console.info('Another booking hold worker owns the current lease. No expiry batch was started.');}
  else {
  console.info("Booking hold worker started (15 seconds).");
  while (!stopping) {
    try {
      const result=await runHoldWorkerBatch(instanceId,()=>expireBookingHolds(20));
      if(!result.owned){console.info('Booking hold worker lease was lost; stopping.');break;}
      if(result.errorType){console.error('Booking expiry batch failed',{type:result.errorType});if(process.argv.includes('--once'))process.exitCode=1;}
      else if(result.processed)console.info('Expired booking holds',{count:result.processed});
    }
    catch (e) {
      console.error("Booking expiry batch failed", { type: e instanceof Error ? e.name : "unknown" });
      if(process.argv.includes('--once'))process.exitCode=1;
    }
    if(process.argv.includes('--once'))break;
    if (!stopping)
      await new Promise<void>(resolve => { const timer = setTimeout(() => { wake = undefined; resolve(); }, 15000); wake = () => { clearTimeout(timer); wake = undefined; resolve(); }; });
  }
  }
}
finally {
  if(claimed)await releaseHoldWorker(instanceId).catch(()=>{});
  await db.end();
  console.info("Booking hold worker stopped.");
}
