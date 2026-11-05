import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { db, transaction } from "../../lib/db";
import { uuid } from "../../lib/http";
import { storedActor, audit } from "../partners/service";
import { DomainError, type Actor } from "../partners/workflow";
import { agencyOperatingContext } from "../agencies/service";
import { lockCartSources, quoteCartSelectionInTransaction } from "../cart/service";
import type { CartQuote } from "../cart/pricing";
import { holdExpiry, quotationCommand, quotationDigest, quotationFinancial, quotationPolicies } from "./quotation-schema";
type RequestRow = {
  id: string;
  agency_id: string;
  renter_id: string;
  status: string;
  version: number;
};
type Line = {
  id: string;
  public_quote: CartQuote;
  policy_snapshot: Record<string, any>;
  service_snapshot: Record<string, unknown>;
  private_financial_snapshot: Record<string, unknown>;
};
async function context(c: PoolClient, actor: Actor, id: string, lock = false) {
  const r = (await c.query<RequestRow>(`SELECT * FROM booking_request WHERE id=$1${lock ? " FOR UPDATE" : ""}`, [uuid.parse(id)])).rows[0];
  const user = await storedActor(actor, c);
  if (!r)
    throw new DomainError("Request not found.", 404);
  const owner = r.renter_id === user.id;
  const agencyActive = Boolean((await c.query("SELECT 1 FROM agency a JOIN app_actor o ON o.id=a.owner_id WHERE a.id=$1 AND a.active AND NOT o.suspended AND NOT o.is_test_fixture", [r.agency_id])).rowCount);
  const operator = !owner && Boolean((await c.query("SELECT 1 FROM agency a JOIN app_actor o ON o.id=a.owner_id LEFT JOIN agency_member m ON m.agency_id=a.id AND m.actor_id=$2 WHERE a.id=$1 AND a.active AND NOT o.suspended AND NOT o.is_test_fixture AND (a.owner_id=$2 OR m.active)", [r.agency_id, user.id])).rowCount);
  if (!owner && !operator)
    throw new DomainError("Request not found.", 404);
  return { r, user, owner, operator, agencyActive };
}
async function lines(c: PoolClient, id: string) { return (await c.query<Line>("SELECT * FROM booking_request_line WHERE request_id=$1 ORDER BY id", [id])).rows; }
export async function lockBookingAuthority(c: PoolClient, ctx: {r:{agency_id:string};user:Actor;owner:boolean}, cosigners: string[], requireOperator: boolean) {
  const agency = (await c.query("SELECT owner_id FROM agency WHERE id=$1 FOR SHARE", [ctx.r.agency_id])).rows[0];
  if (!agency) throw new DomainError("Agency not found.",404);
  const ids = [...new Set([ctx.user.id,agency.owner_id,...cosigners])].sort();
  const actors = (await c.query("SELECT id,suspended,is_test_fixture FROM app_actor WHERE id=ANY($1::text[]) ORDER BY id FOR SHARE",[ids])).rows;
  const authority = await agencyOperatingContext(c,ctx.user,ctx.r.agency_id);
  if (requireOperator && (!authority.operatesAgency || ctx.owner)) throw new DomainError("Active independent agency access is required.",403);
  if (cosigners.some(id=>!actors.some(a=>a.id===id&&!a.suspended&&!a.is_test_fixture))) throw new DomainError("A vehicle owner is no longer active.",409);
  return authority;
}
async function driverOptions(c: PoolClient, agency: string, line: Line) {
  const q = line.public_quote;
  return (await c.query<{
    id: string;
    name: string;
  }>(`SELECT d.id,d.name FROM agency_driver d JOIN resource r ON r.id=d.id WHERE d.agency_id=$1 AND r.agency_id=$1 AND d.active AND r.active AND d.license_expiry>=GREATEST((($3::timestamptz-interval '1 microsecond') AT TIME ZONE 'Asia/Manila')::date,(now() AT TIME ZONE 'Asia/Manila')::date) AND NOT EXISTS(SELECT 1 FROM resource_occupation o WHERE o.resource_id=d.id AND o.cancelled_at IS NULL AND o.period && tstzrange($2::timestamptz,$3::timestamptz+$4::int*interval '1 minute','[)')) ORDER BY d.name,d.id`, [agency, q.startAt, q.endAt, Number(line.policy_snapshot.bufferMinutes)])).rows;
}
async function projection(c: PoolClient, ctx: Awaited<ReturnType<typeof context>>) {
  const { r, owner, operator } = ctx;
  const quotes = (await c.query("SELECT q.*,h.released_at,h.release_reason,EXISTS(SELECT 1 FROM booking_hold_commitment k WHERE k.hold_id=h.id) AS committed,EXISTS(SELECT 1 FROM booking_quotation_decision d WHERE d.quote_id=q.id AND d.action='ACCEPTED') AS accepted,q.expires_at<=clock_timestamp() AS elapsed FROM booking_quotation q JOIN booking_hold h ON h.quote_id=q.id WHERE q.request_id=$1 ORDER BY q.revision DESC", [r.id])).rows;
  const outcome = (q: typeof quotes[number]) => q.release_reason === "EXPIRED" || (!q.released_at && q.elapsed && !q.committed) ? "EXPIRED" : q.release_reason === "DECLINED" ? "DECLINED" : q.release_reason === "WITHDRAWN" ? "WITHDRAWN" : q.accepted ? "ACCEPTED" : "PENDING";
  const current = quotes[0];
  const quote = current ? { id: current.id, revision: current.revision, digest: current.digest, issuedAt: new Date(current.issued_at).toISOString(), expiresAt: new Date(current.expires_at).toISOString(), ...current.public_snapshot, outcome: outcome(current) } : null;
  const selections: {
    lineId: string;
    title: string;
    drivers: {
      id: string;
      name: string;
    }[];
  }[] = [];
  if (operator && ["READY_FOR_APPROVAL", "HOLD_EXPIRED"].includes(r.status))
    for (const line of await lines(c, r.id))
      if (line.public_quote.selection.kind === "RENTAL" && line.public_quote.selection.mode === "WITH_DRIVER")
        selections.push({ lineId: line.id, title: line.public_quote.title, drivers: await driverOptions(c, r.agency_id, line) });
  const serverNow=(await c.query<{now:Date}>("SELECT clock_timestamp() AS now")).rows[0].now.toISOString();
  return { serverNow, requestId: r.id, requestVersion: r.version, status: r.status, isOwner: owner, isOperator: operator, allocationCommitted:Boolean(current?.committed&&!current?.released_at),canIssue: operator && ["READY_FOR_APPROVAL", "HOLD_EXPIRED"].includes(r.status), canRespond: owner && ctx.agencyActive && r.status === "QUOTE_PENDING" && quote?.outcome === "PENDING", driverSelections: selections, quote, history: quotes.map(q => ({ id: q.id, revision: q.revision, issuedAt: new Date(q.issued_at).toISOString(), expiresAt: new Date(q.expires_at).toISOString(), outcome: outcome(q) })) };
}
export async function getQuotation(actor: Actor, id: string) {
  return transaction(async (c) => { await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"); return projection(c, await context(c, actor, id)); });
}
async function record(c: PoolClient, r: RequestRow, user: Actor, action: string, message: string) {
  await c.query("INSERT INTO booking_event(id,request_id,actor_id,action,message)VALUES($1,$2,$3,$4,$5)", [randomUUID(), r.id, user.id, action, message]);
  await audit(c, user, `BOOKING_${action}`, r.id, { message, ...(user.id === "system:booking-hold-expiry" ? { automatic: true } : {}) });
  await c.query("INSERT INTO booking_notification(id,request_id,recipient_id,message) SELECT gen_random_uuid(),$1,a.id,$2 FROM app_actor a WHERE NOT a.suspended AND (a.id=$3 OR a.id IN(SELECT actor_id FROM agency_member WHERE agency_id=$4 AND active))", [r.id, message, r.renter_id, r.agency_id]);
}
async function setStatus(c: PoolClient, r: RequestRow, status: string) { await c.query("UPDATE booking_request SET status=$2,version=version+1 WHERE id=$1", [r.id, status]); r.status = status; r.version++; }
// Every caller owns the request lock before taking a hold, resources or schedules.
async function release(c: PoolClient, hold: any, reason: "EXPIRED" | "DECLINED" | "WITHDRAWN") {
  if((await c.query("SELECT 1 FROM booking_hold_commitment WHERE hold_id=$1",[hold.id])).rowCount)throw new DomainError("Committed allocations require explicit cancellation and financial reconciliation.",409);
  if (hold.released_at)
    return false;
  const resources = (await c.query("SELECT o.id,o.resource_id FROM booking_hold_resource l JOIN resource_occupation o ON o.id=l.occupation_id WHERE l.hold_id=$1 ORDER BY o.resource_id,o.id", [hold.id])).rows;
  await c.query("SELECT id FROM resource WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE", [resources.map(r => r.resource_id)]);
  const seats = (await c.query("SELECT schedule_id,sum(units)::int AS units FROM booking_hold_seat WHERE hold_id=$1 GROUP BY schedule_id ORDER BY schedule_id", [hold.id])).rows;
  await c.query("SELECT id FROM tour_schedule WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE", [seats.map(s => s.schedule_id)]);
  await c.query("UPDATE resource_occupation SET cancelled_at=clock_timestamp(),cancellation_reason=$2 WHERE id=ANY($1::uuid[]) AND cancelled_at IS NULL", [resources.map(r => r.id), `Booking hold released: ${reason}`]);
  for (const seat of seats)
    await c.query("UPDATE tour_schedule SET reserved_units=reserved_units-$2 WHERE id=$1", [seat.schedule_id, seat.units]);
  await c.query("UPDATE booking_hold SET released_at=clock_timestamp(),release_reason=$2 WHERE id=$1", [hold.id, reason]);
  return true;
}
export async function expireBookingHolds(limit = 20) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Expiry batch must be between 1 and 100.");
  const candidates = (await db.query<{
    id: string;
  }>("SELECT r.id FROM booking_request r WHERE r.status IN ('QUOTE_PENDING','QUOTE_ACCEPTED','AGREEMENT_PENDING','AGREEMENT_SIGNED','PAYMENT_RECONCILIATION_REQUIRED') AND EXISTS(SELECT 1 FROM booking_hold h WHERE h.request_id=r.id AND h.released_at IS NULL AND h.expires_at<=clock_timestamp() AND NOT EXISTS(SELECT 1 FROM booking_hold_commitment k WHERE k.hold_id=h.id)) ORDER BY r.id LIMIT $1", [limit])).rows;
  let count = 0;
  for (const candidate of candidates)
    count += await transaction(async (c) => {
      // One request per transaction keeps resource lock ordering global across batches.
      const r = (await c.query<RequestRow>("SELECT * FROM booking_request WHERE id=$1 AND status IN ('QUOTE_PENDING','QUOTE_ACCEPTED','AGREEMENT_PENDING','AGREEMENT_SIGNED','PAYMENT_RECONCILIATION_REQUIRED') FOR UPDATE SKIP LOCKED", [candidate.id])).rows[0];
      if (!r)
        return 0;
      const h = (await c.query("SELECT h.* FROM booking_hold h WHERE request_id=$1 AND released_at IS NULL AND expires_at<=clock_timestamp() AND NOT EXISTS(SELECT 1 FROM booking_hold_commitment k WHERE k.hold_id=h.id) FOR UPDATE", [r.id])).rows[0];
      if (!h)
        return 0;
      await release(c, h, "EXPIRED");
      const reconciliation=r.status==="PAYMENT_RECONCILIATION_REQUIRED";
      await setStatus(c, r, reconciliation?"PAYMENT_RECONCILIATION_REQUIRED":"HOLD_EXPIRED");
      const user: Actor = { id: "system:booking-hold-expiry", role: "RENTER" };
      await c.query("INSERT INTO booking_quotation_decision(id,quote_id,actor_id,action,reason)VALUES($1,$2,$3,'EXPIRED','Automatic quotation hold expiry')", [randomUUID(), h.quote_id, user.id]);
      await record(c, r, user, "HOLD_EXPIRED", reconciliation?"Uncommitted quotation allocation expired and was released. Recorded funds still require reconciliation.":"Quotation hold expired automatically. Request a new quotation before continuing.");
      return 1;
    });
  return count;
}
async function allocate(c: PoolClient, ctx: Awaited<ReturnType<typeof context>>, command: Extract<ReturnType<typeof quotationCommand.parse>, {
  action: "ISSUE_QUOTE";
}>) {
  const { r, user } = ctx, saved = await lines(c, r.id);
  await lockCartSources(c, saved.map(l => l.public_quote.selection));
  const offerIds=saved.flatMap(l=>l.public_quote.selection.kind==="RENTAL"?[l.public_quote.selection.offerId]:[]);
  const cosigners=(await c.query("SELECT v.owner_actor_id FROM physical_vehicle v JOIN vehicle_offer o ON o.vehicle_id=v.id WHERE o.id=ANY($1::uuid[]) AND v.owner_actor_id IS NOT NULL",[offerIds])).rows.map(v=>v.owner_actor_id as string);
  await lockBookingAuthority(c,ctx,cosigners,true);
  // Recheck all published revisions and estimates against the immutable submitted snapshots.
  const rentals: {
    line: Line;
    vehicleId: string;
    driverId: string | null;
    driverName: string | null;
  }[] = [], tourSlots: any[] = [];
  const required = saved.filter(l => l.public_quote.selection.kind === "RENTAL" && l.public_quote.selection.mode === "WITH_DRIVER");
  if (command.drivers.length !== required.length || new Set(command.drivers.map(d => d.lineId)).size !== required.length || command.drivers.some(d => !required.some(l => l.id === d.lineId)))
    throw new DomainError("Choose exactly one eligible driver for every with-driver rental.", 409);
  for (const line of saved) {
    const q = line.public_quote;
    if (q.agencyId !== r.agency_id)
      throw new DomainError("Service agency changed. Submit a new request.", 409);
    const current = await quoteCartSelectionInTransaction(c, user, q.selection);
    if (current.digest !== q.digest)
      throw new DomainError("A service or policy changed. Submit a new request for the current terms.", 409);
    if (q.selection.kind === "RENTAL") {
      const v = (await c.query("SELECT vehicle_id FROM vehicle_offer WHERE id=$1 AND agency_id=$2", [q.selection.offerId, r.agency_id])).rows[0];
      if (!v)
        throw new DomainError("Vehicle unavailable. Submit a new request.", 409);
      rentals.push({ line, vehicleId: v.vehicle_id, driverId: command.drivers.find(d => d.lineId === line.id)?.driverId ?? null, driverName: null });
    }
    else
      tourSlots.push({ line, scheduleId: q.selection.scheduleId });
  }
  const resourceIds = [...new Set(rentals.flatMap(v => [v.vehicleId, ...(v.driverId ? [v.driverId] : [])]))].sort();
  const resources = (await c.query("SELECT id,kind,agency_id,active FROM resource WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE", [resourceIds])).rows;
  if (resources.length !== resourceIds.length || resources.some(v => v.agency_id !== r.agency_id || !v.active))
    throw new DomainError("A selected vehicle or driver is unavailable.", 409);
  // Driver edits also lock resource first; inspect licenses only after this lock.
  for (const v of rentals)
    if (v.driverId) {
      const eligible = await driverOptions(c, r.agency_id, v.line), d = eligible.find(d => d.id === v.driverId);
      if (!d || resources.find(r => r.id === v.driverId)?.kind !== "DRIVER")
        throw new DomainError("The selected driver is unavailable or not eligible.", 409);
      v.driverName = d.name;
    }
  const schedules = (await c.query("SELECT * FROM tour_schedule WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE", [tourSlots.map(s => s.scheduleId)])).rows;
  const now = (await c.query<{now:Date}>("SELECT clock_timestamp() AS now")).rows[0].now.getTime(), expiryInputs: {
    holdHours: number;
    startAt: string;
    cutoffAt?: string;
  }[] = [];
  for (const line of saved)
    expiryInputs.push({ holdHours: Number(line.policy_snapshot.holdHours), startAt: line.public_quote.startAt });
  for (const t of tourSlots) {
    const s = schedules.find(s => s.id === t.scheduleId), q: CartQuote = t.line.public_quote;
    if (!s || q.selection.kind !== "TOUR" || s.tour_id !== q.selection.tourId || s.revision !== q.sourceRevision || s.status !== "SCHEDULED" || new Date(s.cutoff_at).getTime() <= now || new Date(s.start_at).getTime() <= now || new Date(s.start_at).toISOString() !== new Date(q.startAt).toISOString() || new Date(s.end_at).toISOString() !== new Date(q.endAt).toISOString())
      throw new DomainError("Tour departure changed or closed. Submit a new request.", 409);
    const units = s.mode === "PRIVATE" ? 1 : q.selection.partySize;
    if (q.selection.partySize > s.capacity || s.reserved_units + units > (s.mode === "PRIVATE" ? 1 : s.capacity))
      throw new DomainError("This tour departure no longer has capacity.", 409);
    s.reserved_units += units;
    t.units = units;
    expiryInputs.push({ holdHours: Number(t.line.policy_snapshot.holdHours), startAt: q.startAt, cutoffAt: new Date(s.cutoff_at).toISOString() });
  }
  const expiresAt = holdExpiry(now, expiryInputs), issuedAt = new Date(now).toISOString(), quoteId = randomUUID(), holdId = randomUUID();
  const publicLines = saved.map(l => { const q = l.public_quote; quotationFinancial(l.private_financial_snapshot, q.estimate); return { lineId: l.id, title: q.title, kind: q.selection.kind, startAt: q.startAt, endAt: q.endAt, partySize: q.selection.partySize, serviceCentavos: q.estimate.serviceCentavos, refundableDepositCentavos: q.estimate.refundableDepositCentavos, driverName: rentals.find(v => v.line.id === l.id)?.driverName ?? null }; });
  const totals = { serviceCentavos: publicLines.reduce((n, l) => n + l.serviceCentavos, 0), refundableDepositCentavos: publicLines.reduce((n, l) => n + l.refundableDepositCentavos, 0), totalCentavos: 0 };
  totals.totalCentavos = totals.serviceCentavos + totals.refundableDepositCentavos;
  if (!Number.isSafeInteger(totals.totalCentavos))
    throw new DomainError("Invalid quotation total.", 409);
  const policies = saved.map(l => quotationPolicies(l.id, l.public_quote.selection.kind, l.policy_snapshot, l.service_snapshot));
  const revision = Number((await c.query("SELECT COALESCE(max(revision),0)+1 AS revision FROM booking_quotation WHERE request_id=$1", [r.id])).rows[0].revision);
  const snapshot = { lines: publicLines, totals, policies }, digest = quotationDigest({ id: quoteId, requestId: r.id, revision, issuedAt, expiresAt, ...snapshot });
  await c.query("INSERT INTO booking_quotation(id,request_id,revision,digest,issued_by,issued_at,expires_at,public_snapshot)VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [quoteId, r.id, revision, digest, user.id, issuedAt, expiresAt, JSON.stringify(snapshot)]);
  for (const line of saved)
    await c.query("INSERT INTO booking_quotation_line(quote_id,request_id,line_id,public_snapshot,private_financial_snapshot)VALUES($1,$2,$3,$4,$5)", [quoteId, r.id, line.id, JSON.stringify(publicLines.find(l => l.lineId === line.id)), JSON.stringify(quotationFinancial(line.private_financial_snapshot, line.public_quote.estimate))]);
  await c.query("INSERT INTO booking_hold(id,request_id,quote_id,expires_at)VALUES($1,$2,$3,$4)", [holdId, r.id, quoteId, expiresAt]);
  for (const v of rentals)
    for (const resourceId of [v.vehicleId, ...(v.driverId ? [v.driverId] : [])]) {
      const occupation = randomUUID(), q = v.line.public_quote;
      await c.query("INSERT INTO resource_occupation(id,resource_id,kind,start_at,end_at,note,created_by)VALUES($1,$2,'BOOKING',$3,$4::timestamptz+$5::int*interval '1 minute','Quotation resource hold',$6)", [occupation, resourceId, q.startAt, q.endAt, Number(v.line.policy_snapshot.bufferMinutes), user.id]);
      await c.query("INSERT INTO booking_hold_resource(hold_id,quote_id,occupation_id,line_id)VALUES($1,$2,$3,$4)", [holdId, quoteId, occupation, v.line.id]);
    }
  for (const t of tourSlots) {
    await c.query("UPDATE tour_schedule SET reserved_units=reserved_units+$2 WHERE id=$1", [t.scheduleId, t.units]);
    await c.query("INSERT INTO booking_hold_seat(hold_id,quote_id,line_id,schedule_id,units)VALUES($1,$2,$3,$4,$5)", [holdId, quoteId, t.line.id, t.scheduleId, t.units]);
  }
  await setStatus(c, r, "QUOTE_PENDING");
  await record(c, r, user, "ISSUE_QUOTE", "Dated quotation issued. Resources held temporarily; agreement and payment remain pending.");
}
export async function changeQuotation(actor: Actor, id: string, input: unknown) {
  const command = quotationCommand.parse(input);
  if (command.action === "ISSUE_QUOTE") {
    await getQuotation(actor, id);
    await expireBookingHolds();
  }
  try {
    return await transaction(async (c) => {
      const ctx = await context(c, actor, id, true), { r, user, owner, operator } = ctx;
      if (r.version !== command.version)
        throw new DomainError("This request changed. Reload and try again.", 409);
      if (["ISSUE_QUOTE", "WITHDRAW_QUOTE", "REJECT"].includes(command.action) && !operator)
        throw new DomainError("Only the agency may approve or withdraw a quotation; self-review is not allowed.", 403);
      if (command.action === "ISSUE_QUOTE") {
        if (!["READY_FOR_APPROVAL", "HOLD_EXPIRED"].includes(r.status))
          throw new DomainError("This request is not ready for quotation approval.", 409);
        if((await c.query("SELECT 1 FROM booking_payment_attempt t JOIN booking_payment_account a ON a.id=t.account_id WHERE t.request_id=$1 AND a.environment='MANUAL' AND t.method='GCASH' AND t.initial_outcome='SUBMITTED' AND NOT EXISTS(SELECT 1 FROM booking_payment_decision d WHERE d.attempt_id=t.id) UNION ALL SELECT 1 FROM booking_payment_collection WHERE request_id=$1 LIMIT 1",[r.id])).rowCount)throw new DomainError("Resolve pending payment evidence and confirmed funds before issuing a replacement quotation.",409);
        await allocate(c, ctx, command);
      }
      else if (command.action === "REJECT") {
        if (!["READY_FOR_APPROVAL", "HOLD_EXPIRED"].includes(r.status))
          throw new DomainError("This request cannot be rejected at this stage.", 409);
        await lockBookingAuthority(c,ctx,[],true);
        await setStatus(c, r, "REJECTED");
        await record(c, r, user, "REJECT", command.reason);
      }
      else {
        if (command.action !== "WITHDRAW_QUOTE" && !owner)
          throw new DomainError("Only the renter may respond to this quotation.", 403);
        if (r.status !== "QUOTE_PENDING")
          throw new DomainError("This quotation is no longer awaiting a response.", 409);
        const authority=await lockBookingAuthority(c,ctx,[],command.action==="WITHDRAW_QUOTE");
        if (command.action === "ACCEPT_QUOTE" && !authority.active)
          throw new DomainError("This agency is currently unavailable. The quotation cannot be accepted.", 409);
        const q = (await c.query("SELECT * FROM booking_quotation WHERE request_id=$1 ORDER BY revision DESC LIMIT 1", [r.id])).rows[0];
        const h = (await c.query("SELECT *,expires_at<=clock_timestamp() AS elapsed FROM booking_hold WHERE request_id=$1 AND released_at IS NULL FOR UPDATE", [r.id])).rows[0];
        if (!q || q.id !== command.quoteId || q.digest !== command.digest || !h || h.quote_id !== q.id || h.elapsed)
          throw new DomainError("This exact quotation is no longer valid. Reload before continuing.", 409);
        const outcome = command.action === "ACCEPT_QUOTE" ? "ACCEPTED" : command.action === "DECLINE_QUOTE" ? "DECLINED" : "WITHDRAWN";
        const reason = "reason" in command ? command.reason : "Renter accepted the exact quotation.";
        if (outcome !== "ACCEPTED")
          await release(c, h, outcome);
        await c.query("INSERT INTO booking_quotation_decision(id,quote_id,actor_id,action,reason)VALUES($1,$2,$3,$4,$5)", [randomUUID(), q.id, user.id, outcome, reason]);
        await setStatus(c, r, outcome === "ACCEPTED" ? "QUOTE_ACCEPTED" : outcome === "DECLINED" ? "QUOTE_DECLINED" : "READY_FOR_APPROVAL");
        await record(c, r, user, command.action, reason);
      }
      return projection(c, ctx);
    });
  }
  catch (e) {
    if ((e as {
      code?: string;
    }).code === "23P01")
      throw new DomainError("A selected vehicle or driver is already held for these dates. Reload availability.", 409);
    throw e;
  }
}
