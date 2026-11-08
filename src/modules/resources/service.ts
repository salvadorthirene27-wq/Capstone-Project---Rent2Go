import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { storedActor, audit } from "../partners/service";
import { agencyOperatingContext } from "../agencies/service";
import { DomainError, type Actor } from "../partners/workflow";
import {
  driverSchema,
  driverPatchSchema,
  blockSchema,
  windowSchema,
  resourceListSchema,
} from "./schema";
const idSchema = z.uuid();
type ResourceRow = {
  id: string;
  agency_id: string;
  kind: "VEHICLE" | "DRIVER";
  active: boolean;
  vehicle_id: string | null;
  driver_id: string | null;
  owner_actor_id: string | null;
  ownership: string | null;
  offer_id: string | null;
  offer_state: string | null;
  offer_revision: number | null;
  display_make?: string | null;
  display_model?: string | null;
  draft_facts: { make: string; model: string } | null;
  submitted_facts: { make: string; model: string } | null;
  registration_normalized: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  license_number: string | null;
  license_expiry: string | null;
  driver_active: boolean | null;
  driver_version: number | null;
};
const resourceSelect =
  "SELECT r.*,v.owner_actor_id,v.ownership,v.registration_normalized,o.id AS offer_id,o.state AS offer_state,o.revision AS offer_revision,o.draft_facts,o.display_make,o.display_model,vr.facts AS submitted_facts,d.name AS driver_name,d.phone AS driver_phone,d.license_number,d.license_expiry::text AS license_expiry,d.active AS driver_active,d.version AS driver_version FROM resource r LEFT JOIN physical_vehicle v ON v.id=r.vehicle_id LEFT JOIN vehicle_offer o ON o.vehicle_id=r.vehicle_id LEFT JOIN vehicle_revision vr ON vr.offer_id=o.id AND vr.revision=o.revision LEFT JOIN agency_driver d ON d.id=r.driver_id";
async function userInTransaction(c: PoolClient, actor: Actor) {
  return storedActor(actor, c);
}
async function context(c: PoolClient, actor: Actor, id: string, lock = false) {
  if (!idSchema.safeParse(id).success)
    throw new DomainError("Resource not found.", 404);
  const row = (
    await c.query<ResourceRow>(
      `${resourceSelect} WHERE r.id=$1 ${lock ? "FOR UPDATE OF r" : ""}`,
      [id],
    )
  ).rows[0];
  if (!row) throw new DomainError("Resource not found.", 404);
  const user = await userInTransaction(c, actor),
    agency = await agencyOperatingContext(c, user, row.agency_id),
    isOwner = row.owner_actor_id === user.id;
  const operates =
    agency.operatesAgency &&
    (row.kind === "DRIVER" ||
      row.ownership === "AGENCY_OWNED" ||
      Number(row.offer_revision) > 0);
  if (!isOwner && !operates) throw new DomainError("Resource not found.", 404);
  return { row, user, agency, isOwner, operates };
}
function mayCloseClaim(
  ctx: Awaited<ReturnType<typeof context>>,
  claim: { created_by: string },
) {
  return (
    claim.created_by === ctx.user.id ||
    (ctx.operates && claim.created_by !== ctx.row.owner_actor_id)
  );
}
function projection(row: ResourceRow, actorId: string) {
  const facts =
    row.owner_actor_id === actorId || row.ownership === "AGENCY_OWNED"
      ? row.draft_facts
      : row.submitted_facts;
  return {
    id: row.id,
    agencyId: row.agency_id,
    kind: row.kind,
    active: row.active,
    label:
      row.kind === "DRIVER"
        ? (row.driver_name ?? "Driver")
        : `${row.display_make ?? facts?.make ?? "Vehicle"} ${row.display_model ?? facts?.model ?? ""}`,
    registration: row.registration_normalized,
    vehicleOfferId: row.offer_id,
    driver:
      row.kind === "DRIVER"
        ? {
            name: row.driver_name!,
            phone: row.driver_phone!,
            licenseNumber: row.license_number!,
            licenseExpiry: row.license_expiry!,
            active: row.driver_active!,
            version: row.driver_version!,
          }
        : null,
  };
}
function todayManila(value = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(value)
      .map((p) => [p.type, p.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}
export async function resourceDetail(actor: Actor, id: string, page = 1) {
  z.number().int().min(1).max(10000).parse(page);
  return transaction(async (c) => {
    const ctx = await context(c, actor, id);
    const total = Number(
      (
        await c.query(
          "SELECT count(*) AS n FROM resource_occupation WHERE resource_id=$1",
          [id],
        )
      ).rows[0].n,
    );
    const occupations = (
      await c.query(
        "SELECT o.id,o.created_by,o.kind,o.start_at,o.end_at,CASE WHEN o.kind='BOOKING' AND NOT $2::boolean THEN 'Reserved service interval' ELSE o.note END AS note,o.cancelled_at,CASE WHEN o.kind='BOOKING' AND NOT $2::boolean THEN NULL ELSE o.cancellation_reason END AS cancellation_reason,m.cost_centavos,m.completed_at,m.completion_note,m.version AS maintenance_version FROM resource_occupation o LEFT JOIN vehicle_maintenance m ON m.occupation_id=o.id WHERE o.resource_id=$1 ORDER BY o.created_at DESC,o.id LIMIT 25 OFFSET $3",
        [id, ctx.operates, (page - 1) * 25],
      )
    ).rows;
    return {
      ...projection(ctx.row, ctx.user.id),
      agencyName: ctx.agency.name,
      occupations: occupations.map((o) => {
        const { created_by, ...record } = o;
        return {
          ...record,
          canManage:
            o.kind !== "BOOKING" && !o.cancelled_at && mayCloseClaim(ctx, o),
        };
      }),
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / 25)),
      capabilities: { isOwner: ctx.isOwner, operates: ctx.operates },
    };
  });
}
export async function listResources(actor: Actor, input: unknown = {}) {
  const q = resourceListSchema.parse(input);
  return transaction(async (c) => {
    const user = await userInTransaction(c, actor);
    let filter: string, value: string;
    if (q.scope === "AGENCY") {
      if (
        !q.agencyId ||
        !(await agencyOperatingContext(c, user, q.agencyId)).operatesAgency
      )
        throw new DomainError("Active agency access required.", 403);
      filter =
        "r.agency_id=$1::uuid AND (r.kind='DRIVER' OR v.ownership='AGENCY_OWNED' OR o.revision>0)";
      value = q.agencyId;
    } else {
      filter = "v.owner_actor_id=$1";
      value = user.id;
    }
    const joins =
      "FROM resource r LEFT JOIN physical_vehicle v ON v.id=r.vehicle_id LEFT JOIN vehicle_offer o ON o.vehicle_id=r.vehicle_id";
    const total = Number(
      (await c.query(`SELECT count(*) AS n ${joins} WHERE ${filter}`, [value]))
        .rows[0].n,
    );
    const rows = (
      await c.query<ResourceRow>(
        `${resourceSelect} WHERE ${filter} ORDER BY r.kind,r.id LIMIT $2 OFFSET $3`,
        [value, q.pageSize, (q.page - 1) * q.pageSize],
      )
    ).rows;
    return {
      items: rows.map((r) => projection(r, user.id)),
      total,
      page: q.page,
      pageCount: Math.max(1, Math.ceil(total / q.pageSize)),
    };
  });
}
export async function createDriver(actor: Actor, input: unknown) {
  const data = driverSchema.parse(input);
  if (data.active && data.licenseExpiry < todayManila())
    throw new DomainError(
      "An active driver needs a current license expiry date.",
    );
  try {
    return await transaction(async (c) => {
      const user = await userInTransaction(c, actor);
      if (
        !(await agencyOperatingContext(c, user, data.agencyId)).operatesAgency
      )
        throw new DomainError("Active agency access required.", 403);
      const id = randomUUID();
      await c.query(
        "INSERT INTO agency_driver(id,agency_id,name,phone,license_number,license_expiry,active) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          id,
          data.agencyId,
          data.name,
          data.phone,
          data.licenseNumber,
          data.licenseExpiry,
          data.active,
        ],
      );
      await c.query(
        "INSERT INTO resource(id,agency_id,kind,driver_id,active) VALUES($1,$2,'DRIVER',$1,$3)",
        [id, data.agencyId, data.active],
      );
      await audit(c, user, "DRIVER_CREATED", id);
      return { id, version: 1 };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23505")
      throw new DomainError(
        "This driver license is already recorded; duplicate identities are not allowed.",
        409,
      );
    throw e;
  }
}
export async function updateDriver(
  actor: Actor,
  id: string,
  version: number,
  input: unknown,
) {
  const patch = driverPatchSchema.parse(input);
  try {
    return await transaction(async (c) => {
      const ctx = await context(c, actor, id, true);
      if (ctx.row.kind !== "DRIVER" || !ctx.operates)
        throw new DomainError("Driver access required.", 403);
      const row = (
        await c.query(
          'SELECT id,agency_id AS "agencyId",name,phone,license_number AS "licenseNumber",license_expiry::text AS "licenseExpiry",active,version FROM agency_driver WHERE id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0];
      if (row.version !== version)
        throw new DomainError(
          "This driver changed. Reload before saving.",
          409,
        );
      const data = driverSchema.parse({
        agencyId: row.agencyId,
        name: row.name,
        phone: row.phone,
        licenseNumber: row.licenseNumber,
        licenseExpiry: row.licenseExpiry,
        active: row.active,
        ...patch,
      });
      if (data.active && data.licenseExpiry < todayManila())
        throw new DomainError(
          "Renew the license expiry before activating this driver.",
        );
      if (
        !data.active &&
        (
          await c.query(
            "SELECT 1 FROM resource_occupation WHERE resource_id=$1 AND kind='BOOKING' AND cancelled_at IS NULL AND end_at>now() LIMIT 1",
            [id],
          )
        ).rowCount
      )
        throw new DomainError(
          "Resolve upcoming booking assignments before deactivating this driver.",
          409,
        );
      const hasHistory = Boolean(
        (
          await c.query(
            "SELECT 1 FROM resource_occupation WHERE resource_id=$1 AND kind='BOOKING' LIMIT 1",
            [id],
          )
        ).rowCount,
      );
      const normalize = (v: string) => v.toUpperCase().replace(/[ -]/g, "");
      if (
        hasHistory &&
        normalize(data.licenseNumber) !== normalize(row.licenseNumber)
      )
        throw new DomainError(
          "A driver with booking history cannot be changed into another license identity.",
          409,
        );
      if (
        (
          await c.query(
            "SELECT 1 FROM resource_occupation WHERE resource_id=$1 AND kind='BOOKING' AND cancelled_at IS NULL AND end_at>now() AND ((end_at-interval '1 millisecond') AT TIME ZONE 'Asia/Manila')::date>$2::date LIMIT 1",
            [id, data.licenseExpiry],
          )
        ).rowCount
      )
        throw new DomainError(
          "Renew the license through every assigned service or resolve those assignments first.",
          409,
        );
      await c.query(
        "UPDATE agency_driver SET name=$2,phone=$3,license_number=$4,license_expiry=$5,active=$6,version=version+1 WHERE id=$1",
        [
          id,
          data.name,
          data.phone,
          data.licenseNumber,
          data.licenseExpiry,
          data.active,
        ],
      );
      await c.query("UPDATE resource SET active=$2 WHERE id=$1", [
        id,
        data.active,
      ]);
      await audit(c, ctx.user, "DRIVER_UPDATED", id);
      return { id, version: version + 1 };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23505")
      throw new DomainError(
        "This driver license is already recorded; duplicate identities are not allowed.",
        409,
      );
    throw e;
  }
}
export async function createBlock(
  actor: Actor,
  resourceId: string,
  input: unknown,
) {
  const data = blockSchema.parse(input);
  try {
    return await transaction(async (c) => {
      const ctx = await context(c, actor, resourceId, true);
      if (data.kind === "MAINTENANCE" && ctx.row.kind !== "VEHICLE")
        throw new DomainError(
          "Maintenance records apply to vehicles. Use unavailability for drivers.",
        );
      const id = randomUUID();
      // An unsafe returned vehicle still needs a maintenance record. Prevent
      // physical occupancy conflicts here; the safety hold continues to block sales.
      if((await c.query("SELECT EXISTS(SELECT 1 FROM booking_actual_occupation a WHERE a.resource_id=$1 AND ((a.closed_at IS NULL AND (a.planned_end<=clock_timestamp() OR tstzrange(a.opened_at,a.planned_end,'[)') && tstzrange($2::timestamptz,$3::timestamptz,'[)'))) OR (a.closed_at IS NOT NULL AND tstzrange(a.opened_at,a.available_at,'[)') && tstzrange($2::timestamptz,$3::timestamptz,'[)')))) AS blocked",[resourceId,data.startAt,data.endAt])).rows[0].blocked)throw new DomainError("This resource is still out or in its actual return turnaround period.",409);
      await c.query(
        "INSERT INTO resource_occupation(id,resource_id,kind,start_at,end_at,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          id,
          resourceId,
          data.kind,
          data.startAt,
          data.endAt,
          data.note,
          ctx.user.id,
        ],
      );
      if (data.kind === "MAINTENANCE")
        await c.query(
          "INSERT INTO vehicle_maintenance(occupation_id) VALUES($1)",
          [id],
        );
      await audit(c, ctx.user, "RESOURCE_BLOCK_CREATED", resourceId, {
        occupationId: id,
        kind: data.kind,
      });
      return { id, version: 1 };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23P01")
      throw new DomainError(
        "This resource already has an overlapping reservation or unavailability block.",
        409,
      );
    throw e;
  }
}
async function lockedClaim(c: PoolClient, actor: Actor, id: string) {
  idSchema.parse(id);
  const found = (
    await c.query("SELECT resource_id FROM resource_occupation WHERE id=$1", [
      id,
    ])
  ).rows[0];
  if (!found) throw new DomainError("Resource claim not found.", 404);
  const ctx = await context(c, actor, found.resource_id, true);
  const claim = (
    await c.query("SELECT * FROM resource_occupation WHERE id=$1 FOR UPDATE", [
      id,
    ])
  ).rows[0];
  return { ctx, claim };
}
export async function cancelBlock(actor: Actor, id: string, reason: string) {
  z.string().trim().min(10).max(2000).parse(reason);
  return transaction(async (c) => {
    const { ctx, claim } = await lockedClaim(c, actor, id);
    if (!mayCloseClaim(ctx, claim))
      throw new DomainError(
        "The owner or agency that scheduled this block must release or complete it.",
        403,
      );
    if (claim.kind === "BOOKING")
      throw new DomainError(
        "Booking claims must be changed through their booking workflow.",
        403,
      );
    if (claim.cancelled_at)
      throw new DomainError("This block is already closed.", 409);
    await c.query(
      "UPDATE resource_occupation SET cancelled_at=now(),cancellation_reason=$2 WHERE id=$1",
      [id, reason.trim()],
    );
    await audit(c, ctx.user, "RESOURCE_BLOCK_CANCELLED", ctx.row.id, {
      occupationId: id,
      reason,
    });
    return { id };
  });
}
export async function completeMaintenance(
  actor: Actor,
  id: string,
  version: number,
  costCentavos: number,
  note: string,
) {
  z.number().int().min(0).max(100000000).parse(costCentavos);
  z.string().trim().min(10).max(2000).parse(note);
  return transaction(async (c) => {
    const { ctx, claim } = await lockedClaim(c, actor, id);
    if (!mayCloseClaim(ctx, claim))
      throw new DomainError(
        "The owner or agency that scheduled this block must release or complete it.",
        403,
      );
    if (claim.kind !== "MAINTENANCE")
      throw new DomainError("Maintenance record not found.", 404);
    const m = (
      await c.query(
        "SELECT * FROM vehicle_maintenance WHERE occupation_id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (!m || m.version !== version || m.completed_at || claim.cancelled_at)
      throw new DomainError(
        "This maintenance record changed or is already closed.",
        409,
      );
    await c.query(
      "UPDATE vehicle_maintenance SET completed_at=now(),cost_centavos=$2,completion_note=$3,version=version+1 WHERE occupation_id=$1",
      [id, costCentavos, note.trim()],
    );
    await c.query(
      "UPDATE resource_occupation SET cancelled_at=now(),cancellation_reason=$2 WHERE id=$1",
      [id, note.trim()],
    );
    await audit(c, ctx.user, "MAINTENANCE_COMPLETED", ctx.row.id, {
      occupationId: id,
      costCentavos,
    });
    return { id, version: version + 1, costCentavos };
  });
}
export async function resourceAvailability(
  actor: Actor,
  id: string,
  input: unknown,
) {
  const q = windowSchema.parse(input);
  return transaction(async (c) => {
    const ctx = await context(c, actor, id),
      free = !(
        await c.query(
          "SELECT 1 WHERE booking_actual_resource_conflict($1,$2,$3) OR EXISTS(SELECT 1 FROM resource_occupation WHERE resource_id=$1 AND cancelled_at IS NULL AND period && tstzrange($2::timestamptz,$3::timestamptz,'[)'))",
          [id, q.startAt, q.endAt],
        )
      ).rowCount;
    let eligible = ctx.row.active && ctx.agency.active;
    if (ctx.row.kind === "DRIVER")
      eligible =
        eligible &&
        Boolean(ctx.row.driver_active) &&
        Boolean(
          ctx.row.license_expiry &&
          ctx.row.license_expiry >= todayManila() &&
          ctx.row.license_expiry >=
            todayManila(new Date(Date.parse(q.endAt) - 1)),
        );
    else {
      eligible = eligible && ctx.row.offer_state === "PUBLISHED";
      if (ctx.row.owner_actor_id)
        eligible =
          eligible &&
          Boolean(
            (
              await c.query(
                "SELECT 1 FROM app_actor WHERE id=$1 AND NOT suspended AND NOT is_test_fixture",
                [ctx.row.owner_actor_id],
              )
            ).rowCount,
          );
      const t = (
        await c.query("SELECT draft_terms FROM vehicle_offer WHERE id=$1", [
          ctx.row.offer_id,
        ])
      ).rows[0]?.draft_terms;
      eligible =
        eligible &&
        Boolean(
          t?.modes.every((m: string) =>
            ctx.agency.policy.services.includes(m as any),
          ),
        );
    }
    return {
      free,
      bookable: free && eligible,
      startAt: q.startAt,
      endAt: q.endAt,
    };
  });
}
export async function resourceActualStatus(actor:Actor,id:string){
 return transaction(async c=>{
  await context(c,actor,id);
  const actual=(await c.query("SELECT opened_at,planned_end,closed_at,available_at,closed_at IS NULL AND planned_end<=clock_timestamp() AS overdue,closed_at IS NOT NULL AND available_at>clock_timestamp() AS turnaround FROM booking_actual_occupation WHERE resource_id=$1 ORDER BY opened_at DESC,id DESC LIMIT 1",[id])).rows[0];
  const safetyHold=Boolean((await c.query("SELECT 1 FROM booking_actual_occupation a JOIN resource r ON r.id=a.resource_id WHERE a.resource_id=$1 AND r.kind='VEHICLE' AND a.closed_at IS NOT NULL AND booking_return_safety_hold(a.quote_id,a.line_id) LIMIT 1",[id])).rowCount);
  const upcoming=actual?.overdue?Number((await c.query("SELECT count(*) n FROM resource_occupation WHERE resource_id=$1 AND kind='BOOKING' AND cancelled_at IS NULL AND start_at>clock_timestamp()",[id])).rows[0].n):0;
  return {active:Boolean(actual&&!actual.closed_at),overdue:Boolean(actual?.overdue),turnaround:Boolean(actual?.turnaround),plannedEnd:actual?(actual.planned_end as Date).toISOString():null,returnedAt:actual?.closed_at?(actual.closed_at as Date).toISOString():null,availableAfter:actual?.available_at?(actual.available_at as Date).toISOString():null,safetyHold,upcomingConflictCount:upcoming};
 });
}
