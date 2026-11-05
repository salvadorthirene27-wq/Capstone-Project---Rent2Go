import { bookingWorkerTarget } from "./lib/booking-worker-target";
// Deliberately opt in: this worker must never silently target an old project.
process.env.DATABASE_URL = bookingWorkerTarget(process.env, process.argv.slice(2));
const { db } = await import("../src/lib/db");
const { expireBookingHolds } = await import("../src/modules/bookings/quotation");
let stopping = false;
let wake: (() => void) | undefined;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => { stopping = true; wake?.(); });
try {
  const schema = (await db.query("SELECT to_regclass('booking_hold') AS table_name")).rows[0];
  if (!schema.table_name)
    throw new Error("Apply quotation migration before starting the worker.");
  console.info("Booking hold worker started (15 seconds).");
  while (!stopping) {
    try {
      const expired = await expireBookingHolds(20);
      if (expired)
        console.info("Expired booking holds", { count: expired });
    }
    catch (e) {
      console.error("Booking expiry batch failed", { type: e instanceof Error ? e.name : "unknown" });
    }
    if (!stopping)
      await new Promise<void>(resolve => { const timer = setTimeout(() => { wake = undefined; resolve(); }, 15000); wake = () => { clearTimeout(timer); wake = undefined; resolve(); }; });
  }
}
finally {
  await db.end();
  console.info("Booking hold worker stopped.");
}
