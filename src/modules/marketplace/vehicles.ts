import { db } from "../../lib/db";
import type { PoolClient } from "pg";
import { vehicleSearchSchema } from "./schema";
import { rentalEstimate } from "../pricing/rental";
import type { VehicleFacts, VehicleTerms } from "../vehicles/schema";
export async function searchVehicles(
  input: unknown = {},
  client: Pick<PoolClient, "query"> = db,
) {
  const q = vehicleSearchSchema.parse(input),
    values: unknown[] = [],
    bind = (v: unknown) => {
      values.push(v);
      return `$${values.length}`;
    },
    clauses: string[] = [];
  const selected = q.mode
    ? bind(q.mode)
    : "CASE WHEN (r.terms->'modes') ? 'SELF_DRIVE' THEN 'SELF_DRIVE' ELSE 'WITH_DRIVER' END";
  const escape = (v: string) => `%${v.replace(/[\\%_]/g, "\\$&")}%`;
  clauses.push(
    "o.state='PUBLISHED' AND o.revision=o.approved_revision AND (r.terms->'modes') <@ (ar.payload->'services') AND a.active AND NOT ao.suspended AND NOT ao.is_test_fixture AND (v.owner_actor_id IS NULL OR (NOT vo.suspended AND NOT vo.is_test_fixture)) AND resource.active AND (ar.payload->>'holdHours')::int>0 AND (ar.payload->>'bufferMinutes') IS NOT NULL",
  );
  if (q.id) clauses.push(`o.id=${bind(q.id)}::uuid`);
  if (q.agencyId) clauses.push(`o.agency_id=${bind(q.agencyId)}::uuid`);
  if (q.search) {
    const b = bind(escape(q.search));
    clauses.push(
      `(concat_ws(' ',COALESCE(o.display_make,r.facts->>'make'),COALESCE(o.display_model,r.facts->>'model'),r.facts->>'description') ILIKE ${b})`,
    );
  }
  if (q.serviceArea)
    clauses.push(
      `(ar.payload->>'serviceAreas') ILIKE ${bind(escape(q.serviceArea))}`,
    );
  if (q.mode) clauses.push(`(r.terms->'modes') ? ${selected}`);
  if (q.partySize)
    clauses.push(
      `(r.facts->>'seats')::int-CASE WHEN (${selected})='WITH_DRIVER' THEN 1 ELSE 0 END>=${bind(q.partySize)}::int`,
    );
  for (const key of ["transmission", "fuel", "bodyType"] as const)
    if (q[key]) clauses.push(`r.facts->>'${key}'=${bind(q[key])}`);
  if (q.billingUnit)
    clauses.push(`r.terms->>'billingUnit'=${bind(q.billingUnit)}`);
  if (q.maxRateCentavos)
    clauses.push(
      `(r.terms->>'rateCentavos')::bigint<=${bind(q.maxRateCentavos)}::bigint`,
    );
  let start: string | undefined,
    end: string | undefined,
    bufferedEnd: string | undefined;
  if (q.startAt && q.endAt) {
    start = `${bind(q.startAt)}::timestamptz`;
    end = `${bind(q.endAt)}::timestamptz`;
    bufferedEnd = `(${end}+COALESCE((ar.payload->>'bufferMinutes')::int,0)*interval '1 minute')`;
    clauses.push(
      `NOT EXISTS(SELECT 1 FROM resource_occupation oc WHERE oc.resource_id=v.id AND oc.cancelled_at IS NULL AND oc.period && tstzrange(${start},${bufferedEnd},'[)'))`,
      `NOT booking_actual_resource_conflict(v.id,${start},${bufferedEnd})`,
    );
  }
  const driverDate = end
    ? `((${end}-interval '1 microsecond') AT TIME ZONE 'Asia/Manila')::date`
    : `(now() AT TIME ZONE 'Asia/Manila')::date`;
  const driverFree =
    start && bufferedEnd
      ? `AND NOT EXISTS(SELECT 1 FROM resource_occupation dc WHERE dc.resource_id=d.id AND dc.cancelled_at IS NULL AND dc.period && tstzrange(${start},${bufferedEnd},'[)')) AND NOT booking_actual_resource_conflict(d.id,${start},${bufferedEnd})`
      : "";
  clauses.push(
    `((${selected})='SELF_DRIVE' OR (r.terms->>'driverFeeUnit' IN ('PER_BOOKING','PER_24_HOURS','PER_CALENDAR_DAY','PER_HOUR','PER_RENTAL_UNIT') AND r.terms->>'driverFeeCentavos' IS NOT NULL AND EXISTS(SELECT 1 FROM agency_driver d JOIN resource dr ON dr.driver_id=d.id WHERE d.agency_id=a.id AND d.active AND dr.active AND d.license_expiry>=GREATEST(${driverDate},(now() AT TIME ZONE 'Asia/Manila')::date) ${driverFree})))`,
  );
  let rentalUnits = "NULL::bigint",
    driverUnits = "NULL::bigint";
  if (start && end) {
    const hours = `ceil(extract(epoch FROM (${end}-${start}))/3600)::bigint`,
      days = `ceil(extract(epoch FROM (${end}-${start}))/86400)::bigint`,
      calendar = `(((${end}-interval '1 microsecond') AT TIME ZONE 'Asia/Manila')::date-(${start} AT TIME ZONE 'Asia/Manila')::date+1)::bigint`;
    rentalUnits = `CASE r.terms->>'billingUnit' WHEN 'HOUR' THEN ${hours} WHEN 'CALENDAR_DAY' THEN ${calendar} ELSE ${days} END`;
    driverUnits = `CASE WHEN (${selected})='SELF_DRIVE' THEN 0 ELSE CASE r.terms->>'driverFeeUnit' WHEN 'PER_BOOKING' THEN 1 WHEN 'PER_24_HOURS' THEN ${days} WHEN 'PER_CALENDAR_DAY' THEN ${calendar} WHEN 'PER_HOUR' THEN ${hours} WHEN 'PER_RENTAL_UNIT' THEN (${rentalUnits}) END END`;
  }
  const cte = `WITH eligible AS(SELECT o.id,o.agency_id,r.facts||jsonb_strip_nulls(jsonb_build_object('make',o.display_make,'model',o.display_model)) AS facts,r.terms,r.revision,COALESCE(a.display_name,ar.payload->>'businessName') AS agency_name,ar.payload->>'serviceAreas' AS service_areas,(${selected}) AS effective_mode,(${rentalUnits})*(r.terms->>'rateCentavos')::bigint+(${driverUnits})*COALESCE((r.terms->>'driverFeeCentavos')::bigint,0) AS service_centavos,COALESCE((SELECT jsonb_agg(f.id ORDER BY f.created_at,f.id) FROM vehicle_revision_file rf JOIN vehicle_file f ON f.id=rf.file_id WHERE rf.offer_id=o.id AND rf.revision=o.approved_revision AND f.purpose='PHOTO'),'[]'::jsonb) AS photo_ids FROM vehicle_offer o JOIN physical_vehicle v ON v.id=o.vehicle_id JOIN resource ON resource.vehicle_id=v.id JOIN agency a ON a.id=o.agency_id JOIN partner_revision ar ON ar.application_id=a.application_id AND ar.revision=a.approved_revision JOIN app_actor ao ON ao.id=a.owner_id LEFT JOIN app_actor vo ON vo.id=v.owner_actor_id JOIN vehicle_revision r ON r.offer_id=o.id AND r.revision=o.approved_revision WHERE ${clauses.join(" AND ")})`;
  const moneySafe = q.startAt
    ? "service_centavos+(terms->>'depositCentavos')::bigint<=100000000"
    : "true";
  const total = Number(
    (
      await client.query(
        `${cte} SELECT count(*) AS n FROM eligible WHERE ${moneySafe}`,
        values,
      )
    ).rows[0].n,
  );
  const sort: string[] = [];
  if (q.sort === "RECOMMENDED") {
    if (q.budgetCentavos)
      sort.push(`(service_centavos<=${bind(q.budgetCentavos)}::bigint) DESC`);
    if (q.preferredTransmission)
      sort.push(
        `(facts->>'transmission'=${bind(q.preferredTransmission)}) DESC`,
      );
    sort.push(
      q.startAt
        ? "service_centavos ASC"
        : "(terms->>'rateCentavos')::bigint ASC",
    );
  } else if (q.sort === "NAME")
    sort.push("lower(concat_ws(' ',facts->>'make',facts->>'model'))");
  else
    sort.push(
      `(terms->>'rateCentavos')::bigint ${q.sort === "PRICE_ASC" ? "ASC" : "DESC"}`,
    );
  sort.push("id");
  const rows = (
    await client.query(
      `${cte} SELECT * FROM eligible WHERE ${moneySafe} ORDER BY ${sort.join(",")} LIMIT ${bind(q.pageSize)} OFFSET ${bind((q.page - 1) * q.pageSize)}`,
      values,
    )
  ).rows;
  const items = rows.map((row) => {
    const t = row.terms as VehicleTerms,
      f = row.facts as VehicleFacts,
      mode = row.effective_mode as "SELF_DRIVE" | "WITH_DRIVER",
      estimate =
        q.startAt && q.endAt
          ? rentalEstimate(t, q.startAt, q.endAt, mode)
          : null,
      reasons: string[] = [];
    if (q.startAt)
      reasons.push("No conflicting vehicle block, including turnaround time.");
    else reasons.push("Select dates to check actual availability.");
    if (mode === "WITH_DRIVER")
      reasons.push(
        q.startAt
          ? "An eligible driver is free for this interval."
          : "Agency has an active licensed driver; dates still need checking.",
      );
    if (q.partySize)
      reasons.push(
        `Fits ${q.partySize} guest${q.partySize === 1 ? "" : "s"}${mode === "WITH_DRIVER" ? " in addition to the driver" : ""}.`,
      );
    if (q.budgetCentavos && estimate)
      reasons.push(
        estimate.serviceCentavos <= q.budgetCentavos
          ? "Service estimate fits your preferred budget; deposit is separate."
          : "Service estimate exceeds your preferred budget; deposit is separate.",
      );
    if (q.preferredTransmission)
      reasons.push(
        f.transmission === q.preferredTransmission
          ? "Matches your transmission preference."
          : "A different transmission from your preference.",
      );
    return {
      id: String(row.id),
      agencyId: String(row.agency_id),
      agencyName: String(row.agency_name),
      serviceAreas: String(row.service_areas),
      photoIds: row.photo_ids as string[],
      revision: Number(row.revision),
      facts: f,
      pricing: {
        rateCentavos: t.rateCentavos,
        depositCentavos: t.depositCentavos,
        billingUnit: t.billingUnit,
        modes: t.modes,
        driverFeeCentavos: t.driverFeeCentavos,
        driverFeeUnit: t.driverFeeUnit ?? null,
        inclusions: t.inclusions,
        exclusions: t.exclusions,
      },
      estimate,
      estimateMode: mode,
      availabilityChecked: Boolean(q.startAt),
      reasons,
    };
  });
  return {
    items,
    total,
    page: q.page,
    pageCount: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}
