import { db } from "../src/lib/db";
import { expireBookingHolds } from "../src/modules/bookings/quotation";

// Deliberately opt in: this worker must never silently target an old project.
if(process.env.BOOKING_HOLD_WORKER_ENABLED!=="true" || process.env.NEON_PROJECT_ID!=="floral-flower-08375841") throw new Error("Enable the booking hold worker explicitly on the new Rent2Go project.");
let stopping=false;
let wake: (()=>void)|undefined;
for(const signal of ["SIGINT","SIGTERM"] as const)process.on(signal,()=>{stopping=true;wake?.();});
try {
  const schema=(await db.query("SELECT to_regclass('booking_hold') AS table_name")).rows[0];
  if(!schema.table_name)throw new Error("Apply quotation migration before starting the worker.");
  console.info("Booking hold worker started (15 seconds).");
  while(!stopping){
    try { const expired=await expireBookingHolds(20);if(expired)console.info("Expired booking holds",{count:expired}); }
    catch(e){console.error("Booking expiry batch failed",{type:e instanceof Error?e.name:"unknown"});}
    if(!stopping)await new Promise<void>(resolve=>{const timer=setTimeout(()=>{wake=undefined;resolve();},15000);wake=()=>{clearTimeout(timer);wake=undefined;resolve();};});
  }
} finally {await db.end();console.info("Booking hold worker stopped.");}
