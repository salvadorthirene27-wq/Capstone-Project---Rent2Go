import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import { approvedAgency } from "../helpers/agency";
import { createVehicleOffer, transitionVehicleOffer } from "../../src/modules/vehicles/service";
import { createDriver } from "../../src/modules/resources/service";
import { createTour, attachTourPhoto, publishTour, createTourSchedule } from "../../src/modules/tours/service";
import { quoteCartSelection, addToCart, readCart } from "../../src/modules/cart/service";
import { submitBookingRequests } from "../../src/modules/bookings/service";
import { getQuotation, changeQuotation, expireBookingHolds } from "../../src/modules/bookings/quotation";
import type { Actor } from "../../src/modules/partners/workflow";
const operator: Actor = { id: randomUUID(), role: "RENTER" }, admin: Actor = { id: randomUUID(), role: "SUPER_ADMIN" }, renter: Actor = { id: randomUUID(), role: "RENTER" }, foreign: Actor = { id: randomUUID(), role: "RENTER" };
let agency: string, car: any, car2: any, driver: any, group: any, privateTour: any;
const period = (day: number) => ({ startAt: `2031-09-${String(day).padStart(2,"0")}T00:00:00Z`, endAt: `2031-09-${String(day).padStart(2,"0")}T04:00:00Z` });
async function vehicle() {
  let v = await createVehicleOffer(operator, { ownership: "AGENCY_OWNED", agencyId: agency, registration: `QT${randomUUID().replaceAll("-", "").slice(0,10)}`, facts: { make: "Synthetic", model: "Quotation", year: 2024, seats: 5, transmission: "AUTOMATIC", fuel: "GASOLINE", bodyType: "SEDAN", description: "Synthetic quotation test car.", features: [], pickupInstructions: "Synthetic office" } });
  for (const purpose of ["OWNERSHIP", "PHOTO"]) await db.query("INSERT INTO vehicle_file(id,vehicle_id,uploader_id,purpose,object_key,original_name,mime,size_bytes,sha256,backend) VALUES($1,$2,$3,$4,$5,'test.png','image/png',10,'test','local')", [randomUUID(), v.vehicleId, operator.id, purpose, `${v.vehicleId}/${randomUUID()}`]);
  for (const [actor, action] of [[operator,"SUBMIT"],[admin,"APPROVE"],[operator,"PUBLISH"]] as const) v = await transitionVehicleOffer(actor,v.id,{action,version:v.version,revision:v.revision,reason:"Independent quotation fixture review."});
  return v;
}
async function tour(mode: "GROUP"|"PRIVATE") {
  let t = await createTour(operator, { agencyId: agency, payload: { title: "Synthetic quotation tour", mode, description: "Synthetic quotation itinerary.", serviceArea: "Albay", meetingPoint: "Synthetic office", itinerary: [{title:"Synthetic stop",description:"Synthetic guided visit."}], inclusions:"Guide", exclusions:"Meals", eligibilityTerms:"Identity review", terms:"Accepted quotation", cancellationPolicy:"Agency review", refundPolicy:"Separate review", priceCentavos:100000,minParty:1,maxParty:8,transportIncluded:true,fulfillment:"TOUR_ONLY" } });
  t.version = (await attachTourPhoto(operator,t.id,t.version,{id:randomUUID(),name:"test.png",mime:"image/png",size:10,sha256:"0".repeat(64),backend:"local"})).version;
  return publishTour(operator,t.id,t.version);
}
async function request(selections: unknown[], ready = true) {
  for (const selection of selections) { const q = await quoteCartSelection(renter, selection); await addToCart(renter,{selection,quoteDigest:q.digest}); }
  const cart = await readCart(renter);
  const result = await submitBookingRequests(renter,{ idempotencyKey:randomUUID(),cartVersion:cart.version,items:cart.groups.flatMap(g=>g.items).map(i=>({id:i.id,version:i.version,quoteDigest:i.savedQuote.digest})),contact:{name:"Synthetic renter",phone:"+639171234567",notes:"Synthetic quotation tests"} });
  const id = result.requests[0].id;
  if(ready) await db.query("UPDATE booking_request SET status='READY_FOR_APPROVAL' WHERE id=$1",[id]);
  return getQuotation(operator,id);
}
const rental = (v: any, day: number, mode = "SELF_DRIVE") => ({kind:"RENTAL",offerId:v.id,...period(day),partySize:2,mode});
const issue = (s:any, drivers:any[] = []) => changeQuotation(operator,s.requestId,{action:"ISSUE_QUOTE",version:s.requestVersion,drivers});
const exact = (s:any,action:string,reason?:string) => ({action,version:s.requestVersion,quoteId:s.quote.id,digest:s.quote.digest,...(reason?{reason}:{})});
beforeAll(async () => {
  if(!process.env.TEST_DATABASE_URL || process.env.NEON_PROJECT_ID!=="floral-flower-08375841") throw Error("Use isolated test DB.");
  for(const a of [operator,admin,renter,foreign]) await db.query("INSERT INTO app_actor(id,email,name,role)VALUES($1,$2,'Synthetic quotation actor',$3)",[a.id,`${a.id}@example.test`,a.role]);
  agency = await approvedAgency(operator,admin,{services:["SELF_DRIVE","WITH_DRIVER","GROUP_TOUR","PRIVATE_TOUR"],driverFeeCentavos:25000,driverFeeUnit:"PER_BOOKING",perPersonCentavos:100000,perPartyCentavos:100000});
  car=await vehicle();car2=await vehicle();
  driver=await createDriver(operator,{agencyId:agency,name:"Synthetic quotation driver",phone:"+639171234567",licenseNumber:`QT-${randomUUID()}`,licenseExpiry:"2099-12-31"});
  group=await tour("GROUP");privateTour=await tour("PRIVATE");
},120000);
afterAll(()=>db.end());
it("requires ready review, scoped active actors, current versions and no self approval",async()=>{
  const s=await request([rental(car,1)],false);
  await expect(issue(s)).rejects.toMatchObject({status:409});
  for(const a of [foreign,admin]) await expect(getQuotation(a,s.requestId)).rejects.toMatchObject({status:404});
  await db.query("INSERT INTO agency_member(agency_id,actor_id,role)VALUES($1,$2,'ADMIN')",[agency,renter.id]);
  await expect(changeQuotation(renter,s.requestId,{action:"ISSUE_QUOTE",version:s.requestVersion,drivers:[]})).rejects.toMatchObject({status:403});
});
it("issues immutable exact quotations and keeps private finances and driver contacts out of projections",async()=>{
  let s=await request([rental(car,2,"WITH_DRIVER")]);
  const line=s.driverSelections[0];
  await expect(issue(s)).rejects.toMatchObject({status:409});
  s=await issue(s,[{lineId:line.lineId,driverId:driver.id}]);
  expect(s.status).toBe("QUOTE_PENDING");
  const owner=await getQuotation(renter,s.requestId);
  expect(owner.driverSelections).toEqual([]);expect(owner.quote?.lines[0].driverName).toBe("Synthetic quotation driver");
  expect(JSON.stringify(owner)).not.toMatch(/shares|license|phone|private_financial|allocationBasis/);
  await expect(changeQuotation(renter,s.requestId,{...exact(s,"ACCEPT_QUOTE"),digest:"f".repeat(64)})).rejects.toMatchObject({status:409});
  const accepted=await changeQuotation(renter,s.requestId,exact(s,"ACCEPT_QUOTE"));
  expect(accepted.status).toBe("QUOTE_ACCEPTED");expect(accepted.quote?.expiresAt).toBe(s.quote!.expiresAt);
  await expect(changeQuotation(operator,s.requestId,exact(accepted,"WITHDRAW_QUOTE","Cannot withdraw accepted quote"))).rejects.toMatchObject({status:409});
  await expect(db.query("UPDATE booking_quotation SET digest=$2 WHERE id=$1",[s.quote!.id,"0".repeat(64)])).rejects.toThrow();
  const financial=(await db.query("SELECT private_financial_snapshot FROM booking_quotation_line WHERE quote_id=$1",[s.quote!.id])).rows[0].private_financial_snapshot;
  expect(financial.serviceRevenueCentavos).toBe(s.quote!.totals.serviceCentavos);expect(financial.driverFeeCentavos).toBeGreaterThan(0);
});
it("serializes competing vehicle holds and stale same-request retries",async()=>{
  const a=await request([rental(car,3)]),b=await request([rental(car,3)]);
  const result=await Promise.allSettled([issue(a),issue(b)]);
  expect(result.filter(v=>v.status==="fulfilled")).toHaveLength(1);
  for(const r of result) if(r.status==="rejected") expect(r.reason.status).toBe(409);
  const winner=result.find(v=>v.status==="fulfilled") as PromiseFulfilledResult<any>;
  await expect(issue(a.requestId===winner.value.requestId?a:b)).rejects.toMatchObject({status:409});
},30000);
it("rolls back every line when chosen drivers collide across competing requests",async()=>{
  const a=await request([rental(car,4,"WITH_DRIVER")]),b=await request([rental(car2,4,"WITH_DRIVER")]);
  const outcomes=await Promise.allSettled([issue(a,[{lineId:a.driverSelections[0].lineId,driverId:driver.id}]),issue(b,[{lineId:b.driverSelections[0].lineId,driverId:driver.id}])]);
  expect(outcomes.filter(o=>o.status==="fulfilled")).toHaveLength(1);
  const loser=outcomes[0].status==="rejected"?a:b;
  expect((await db.query("SELECT count(*) FROM booking_hold WHERE request_id=$1",[loser.requestId])).rows[0].count).toBe("0");
},30000);
it("holds group seats cumulatively, releases once and versions withdrawn quotations",async()=>{
  const slot=await createTourSchedule(operator,group.id,group.version,{...period(5),cutoffAt:"2031-09-04T00:00:00Z",capacity:8});
  const sel={kind:"TOUR",tourId:group.id,scheduleId:slot.id,partySize:5};
  let a=await request([sel]);const b=await request([sel]);
  a=await issue(a);await expect(issue(b)).rejects.toMatchObject({status:409});
  a=await changeQuotation(operator,a.requestId,exact(a,"WITHDRAW_QUOTE","Resource planning changed"));
  expect(a.status).toBe("READY_FOR_APPROVAL");expect((await db.query("SELECT reserved_units FROM tour_schedule WHERE id=$1",[slot.id])).rows[0].reserved_units).toBe(0);
  a=await issue(a);expect(a.quote!.revision).toBe(2);expect(a.history).toHaveLength(2);
  a=await changeQuotation(renter,a.requestId,exact(a,"DECLINE_QUOTE","Plans have changed"));
  await expireBookingHolds();expect((await db.query("SELECT reserved_units FROM tour_schedule WHERE id=$1",[slot.id])).rows[0].reserved_units).toBe(0);
});
it("holds private schedules exclusively even when party capacity remains",async()=>{
  const slot=await createTourSchedule(operator,privateTour.id,privateTour.version,{...period(6),cutoffAt:"2031-09-05T00:00:00Z",capacity:8});
  const sel={kind:"TOUR",tourId:privateTour.id,scheduleId:slot.id,partySize:2};
  const a=await request([sel]),b=await request([sel]);await issue(a);await expect(issue(b)).rejects.toMatchObject({status:409});
  expect((await db.query("SELECT reserved_units FROM tour_schedule WHERE id=$1",[slot.id])).rows[0].reserved_units).toBe(1);
});
it("preserves one-release holds, immutable quote links and least-privilege grants",async()=>{
  for(const table of ["booking_quotation","booking_quotation_line","booking_hold_resource","booking_hold_seat","booking_quotation_decision"]){
    const r=(await db.query("SELECT has_table_privilege('rent2go_app',$1,'SELECT') AS read,has_table_privilege('rent2go_app',$1,'INSERT') AS append,has_table_privilege('rent2go_app',$1,'UPDATE') AS update,has_table_privilege('rent2go_app',$1,'DELETE') AS delete",[table])).rows[0];
    expect(r).toEqual({read:true,append:true,update:false,delete:false});
  }
});
