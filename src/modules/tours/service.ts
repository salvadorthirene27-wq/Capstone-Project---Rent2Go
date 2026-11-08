import { randomUUID, createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { storedActor, audit } from "../partners/service";
import { agencyOperatingContext } from "../agencies/service";
import { DomainError, type Actor } from "../partners/workflow";
import {
  tourSchema,
  scheduleSchema,
  tourSearchSchema,
  publicTourDatesSchema,
  type TourInput,
} from "./schema";
type TourRow = {
  id: string;
  agency_id: string;
  state: "DRAFT" | "PUBLISHED" | "WITHDRAWN";
  payload: TourInput;
  version: number;
  revision: number;
  published_revision: number | null;
  display_title?:string|null;
};
const uuid = z.uuid();
function view(r: TourRow) {
  return {
    id: r.id,
    agencyId: r.agency_id,
    state: r.state,
    payload: r.payload,
    displayTitle:r.display_title??r.payload.title,
    version: r.version,
    revision: r.revision,
    publishedRevision: r.published_revision,
  };
}
function eligible(
  agency: Awaited<ReturnType<typeof agencyOperatingContext>>,
  mode: string,
) {
  return (
    agency.active &&
    agency.policy.services.includes(
      mode === "GROUP" ? "GROUP_TOUR" : "PRIVATE_TOUR",
    )
  );
}
async function context(c: PoolClient, actor: Actor, id: string, write = false) {
  if (!uuid.safeParse(id).success)
    throw new DomainError("Tour package not found.", 404);
  const row = (
    await c.query<TourRow>(
      `SELECT * FROM tour_package WHERE id=$1 ${write ? "FOR UPDATE" : ""}`,
      [id],
    )
  ).rows[0];
  if (!row) throw new DomainError("Tour package not found.", 404);
  const user = await storedActor(actor, c),
    agency = await agencyOperatingContext(c, user, row.agency_id);
  if (!agency.operatesAgency)
    throw new DomainError(
      "Agency access is required for this tour.",
      write ? 403 : 404,
    );
  return { row, user, agency };
}
function expected(row: TourRow, version: number) {
  z.number().int().positive().parse(version);
  if (row.version !== version)
    throw new DomainError(
      "This package changed. Reload before continuing.",
      409,
    );
}
function editable(row: TourRow) {
  if (row.state === "PUBLISHED")
    throw new DomainError(
      "Withdraw this package from new requests before editing it. Existing service records are retained.",
      409,
    );
}
export async function createTour(actor: Actor, input: unknown) {
  const data = z
    .object({ agencyId: uuid, payload: tourSchema })
    .strict()
    .parse(input);
  return transaction(async (c) => {
    const user = await storedActor(actor, c),
      agency = await agencyOperatingContext(c, user, data.agencyId);
    if (!agency.operatesAgency)
      throw new DomainError("Active agency access required.", 403);
    if (!eligible(agency, data.payload.mode))
      throw new DomainError(
        "The approved agency policy does not include this tour model.",
        409,
      );
    const id = randomUUID(),
      row = (
        await c.query<TourRow>(
          "INSERT INTO tour_package(id,agency_id,payload)VALUES($1,$2,$3) RETURNING *",
          [id, data.agencyId, JSON.stringify(data.payload)],
        )
      ).rows[0];
    await audit(c, user, "TOUR_CREATED", id);
    return view(row);
  });
}
export async function saveTour(
  actor: Actor,
  id: string,
  version: number,
  input: unknown,
) {
  const payload = tourSchema.parse(input);
  return transaction(async (c) => {
    const { row, user, agency } = await context(c, actor, id, true);
    expected(row, version);
    editable(row);
    if (!eligible(agency, payload.mode))
      throw new DomainError(
        "The agency is not approved for this tour model.",
        409,
      );
    if (row.revision > 0 && payload.mode !== row.payload.mode)
      throw new DomainError(
        "A published tour keeps its pricing model. Create a separate package for another model.",
        409,
      );
    const saved = (
      await c.query<TourRow>(
        "UPDATE tour_package SET payload=$2,state='DRAFT',version=version+1,updated_at=now() WHERE id=$1 RETURNING *",
        [id, JSON.stringify(payload)],
      )
    ).rows[0];
    await audit(c, user, "TOUR_DRAFT_SAVED", id);
    return view(saved);
  });
}
export async function tourDetail(actor: Actor, id: string, page = 1) {
  z.number().int().min(1).max(10000).parse(page);
  return transaction(async (c) => {
    const { row, agency } = await context(c, actor, id);
    const revisions = (
        await c.query(
          "SELECT revision,payload,agency_policy_revision,platform_bps,agency_bps,digest,created_at FROM tour_revision WHERE tour_id=$1 ORDER BY revision DESC",
          [id],
        )
      ).rows,
      schedules = (
        await c.query(
          "SELECT id,revision,mode,start_at,end_at,cutoff_at,capacity,reserved_units,status,cancellation_reason,cancelled_at FROM tour_schedule WHERE tour_id=$1 ORDER BY start_at DESC,id LIMIT 25 OFFSET $2",
          [id, (page - 1) * 25],
        )
      ).rows,
      files = (
        await c.query(
          "SELECT id,original_name,mime,is_current FROM tour_file WHERE tour_id=$1 ORDER BY created_at,id",
          [id],
        )
      ).rows;
    const scheduleTotal = Number(
      (
        await c.query(
          "SELECT count(*) AS n FROM tour_schedule WHERE tour_id=$1",
          [id],
        )
      ).rows[0].n,
    );
    return {
      ...view(row),
      agencyName: agency.name,
      revisions,
      schedules,
      files,
      scheduleTotal,
      page,
      pageCount: Math.max(1, Math.ceil(scheduleTotal / 25)),
    };
  });
}
export async function publishTour(actor: Actor, id: string, version: number) {
  return transaction(async (c) => {
    const { row, user, agency } = await context(c, actor, id, true);
    expected(row, version);
    editable(row);
    const payload = tourSchema.parse(row.payload);
    if (!eligible(agency, payload.mode))
      throw new DomainError(
        "The agency is not approved for this tour model.",
        409,
      );
    const files = (
      await c.query(
        "SELECT id,sha256 FROM tour_file WHERE tour_id=$1 AND is_current ORDER BY id",
        [id],
      )
    ).rows;
    if (!files.length)
      throw new DomainError(
        "Upload at least one package photo before publication.",
      );
    const revision = row.revision + 1,
      platformBps = agency.policy.split.platform,
      digest = createHash("sha256")
        .update(
          JSON.stringify({
            payload,
            agencyPolicyRevision: agency.revision,
            platformBps,
            files,
          }),
        )
        .digest("hex");
    await c.query(
      "INSERT INTO tour_revision(tour_id,revision,mode,payload,agency_policy_revision,platform_bps,agency_bps,digest,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        id,
        revision,
        payload.mode,
        JSON.stringify(payload),
        agency.revision,
        platformBps,
        10000 - platformBps,
        digest,
        user.id,
      ],
    );
    await c.query(
      "INSERT INTO tour_revision_file(tour_id,revision,file_id) SELECT $1,$2,id FROM tour_file WHERE tour_id=$1 AND is_current",
      [id, revision],
    );
    const saved = (
      await c.query<TourRow>(
        "UPDATE tour_package SET state='PUBLISHED',revision=$2,published_revision=$2,version=version+1,updated_at=now() WHERE id=$1 RETURNING *",
        [id, revision],
      )
    ).rows[0];
    await audit(c, user, "TOUR_PUBLISHED", id, {
      revision,
      agencyPolicyRevision: agency.revision,
    });
    return view(saved);
  });
}
export async function withdrawTour(
  actor: Actor,
  id: string,
  version: number,
  reason: string,
) {
  z.string().trim().min(10).max(2000).parse(reason);
  return transaction(async (c) => {
    const { row, user } = await context(c, actor, id, true);
    expected(row, version);
    if (row.state !== "PUBLISHED")
      throw new DomainError("Only a published package can be withdrawn.", 409);
    const saved = (
      await c.query<TourRow>(
        "UPDATE tour_package SET state='WITHDRAWN',version=version+1,updated_at=now() WHERE id=$1 RETURNING *",
        [id],
      )
    ).rows[0];
    await audit(c, user, "TOUR_WITHDRAWN", id, { reason });
    return view(saved);
  });
}
export async function createTourSchedule(
  actor: Actor,
  id: string,
  version: number,
  input: unknown,
) {
  const data = scheduleSchema.parse(input);
  try {
    return await transaction(async (c) => {
      const { row, user, agency } = await context(c, actor, id, true);
      expected(row, version);
      if (row.state !== "PUBLISHED" || !eligible(agency, row.payload.mode))
        throw new DomainError(
          "Publish an eligible package before adding dates.",
          409,
        );
      if (Date.parse(data.cutoffAt) <= Date.now())
        throw new DomainError("Choose a booking cutoff in the future.");
      if (
        row.payload.mode === "GROUP"
          ? data.capacity < row.payload.maxParty
          : data.capacity < row.payload.minParty ||
            data.capacity > row.payload.maxParty
      )
        throw new DomainError(
          "Capacity must match this package's party-size rules.",
        );
      const scheduleId = randomUUID();
      await c.query(
        "INSERT INTO tour_schedule(id,tour_id,revision,mode,start_at,end_at,cutoff_at,capacity)VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          scheduleId,
          id,
          row.published_revision,
          row.payload.mode,
          data.startAt,
          data.endAt,
          data.cutoffAt,
          data.capacity,
        ],
      );
      await audit(c, user, "TOUR_SCHEDULE_CREATED", id, {
        scheduleId,
        revision: row.published_revision,
      });
      return { id: scheduleId };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23P01")
      throw new DomainError(
        "This private tour already has an overlapping exclusive slot.",
        409,
      );
    throw e;
  }
}
export async function cancelTourSchedule(
  actor: Actor,
  id: string,
  reason: string,
) {
  uuid.parse(id);
  z.string().trim().min(10).max(2000).parse(reason);
  return transaction(async (c) => {
    const found = (
      await c.query("SELECT tour_id FROM tour_schedule WHERE id=$1", [id])
    ).rows[0];
    if (!found) throw new DomainError("Tour schedule not found.", 404);
    const { user } = await context(c, actor, found.tour_id, true),
      s = (
        await c.query("SELECT * FROM tour_schedule WHERE id=$1 FOR UPDATE", [
          id,
        ])
      ).rows[0];
    if (s.status !== "SCHEDULED" || s.reserved_units > 0)
      throw new DomainError(
        "Resolve allocated bookings through their cancellation and refund workflows before cancelling this departure.",
        409,
      );
    await c.query(
      "UPDATE tour_schedule SET status='CANCELLED',cancelled_at=now(),cancellation_reason=$2 WHERE id=$1",
      [id, reason.trim()],
    );
    await audit(c, user, "TOUR_SCHEDULE_CANCELLED", found.tour_id, {
      scheduleId: id,
      reason,
    });
    return { id };
  });
}
const publicJoin =
  "FROM tour_package t JOIN tour_revision r ON r.tour_id=t.id AND r.revision=t.published_revision JOIN agency a ON a.id=t.agency_id JOIN partner_revision ar ON ar.application_id=a.application_id AND ar.revision=a.approved_revision JOIN app_actor owner ON owner.id=a.owner_id";
const visible =
  "t.state='PUBLISHED' AND a.active AND NOT owner.suspended AND NOT owner.is_test_fixture AND (ar.payload->'services') ? CASE WHEN r.mode='GROUP' THEN 'GROUP_TOUR' ELSE 'PRIVATE_TOUR' END";
function publicPayload(payload: unknown,displayTitle?:string|null) {
  const p = tourSchema.parse(payload);
  return {
    title: displayTitle??p.title,
    mode: p.mode,
    description: p.description,
    serviceArea: p.serviceArea,
    meetingPoint: p.meetingPoint,
    itinerary: p.itinerary,
    inclusions: p.inclusions,
    exclusions: p.exclusions,
    eligibilityTerms: p.eligibilityTerms,
    terms: p.terms,
    cancellationPolicy: p.cancellationPolicy,
    refundPolicy: p.refundPolicy,
    priceCentavos: p.priceCentavos,
    minParty: p.minParty,
    maxParty: p.maxParty,
    transportIncluded: p.transportIncluded,
    fulfillment: p.fulfillment,
  };
}
export async function publicTour(
  id: string,
  input: unknown = {},
  client: Pick<PoolClient, "query"> = db,
) {
  const q = publicTourDatesSchema.parse(input);
  if (!uuid.safeParse(id).success)
    throw new DomainError("Tour package not found.", 404);
  const r = (
    await client.query(
      `SELECT t.id,t.agency_id,t.published_revision,r.payload,t.display_title,COALESCE(a.display_name,ar.payload->>'businessName') AS agency_name ${publicJoin} WHERE ${visible} AND t.id=$1`,
      [id],
    )
  ).rows[0];
  if (!r) throw new DomainError("Tour package not found.", 404);
  const scheduleFilter =
    "tour_id=$1 AND revision=$2 AND status='SCHEDULED' AND cutoff_at>now() AND ($3::date IS NULL OR (start_at AT TIME ZONE 'Asia/Manila')::date>=$3::date) AND ($4::date IS NULL OR (start_at AT TIME ZONE 'Asia/Manila')::date<=$4::date) AND ($5::int IS NULL OR ($5>=$6::int AND $5<=$7::int AND CASE WHEN mode='PRIVATE' THEN capacity>=$5 AND reserved_units=0 ELSE capacity-reserved_units>=$5 END))";
  const scheduleValues = [
    id,
    r.published_revision,
    q.dateFrom ?? null,
    q.dateTo ?? null,
    q.partySize ?? null,
    r.payload.minParty,
    r.payload.maxParty,
  ];
  const scheduleTotal = Number(
    (
      await client.query(
        `SELECT count(*) AS n FROM tour_schedule WHERE ${scheduleFilter}`,
        scheduleValues,
      )
    ).rows[0].n,
  );
  const schedules = (
      await client.query(
        `SELECT id,start_at,end_at,cutoff_at,capacity,CASE WHEN mode='PRIVATE' THEN 1-reserved_units ELSE capacity-reserved_units END AS remaining_units FROM tour_schedule WHERE ${scheduleFilter} ORDER BY start_at,id LIMIT 20 OFFSET $8`,
        [...scheduleValues, (q.page - 1) * 20],
      )
    ).rows,
    photos = (
      await client.query(
        "SELECT file_id AS id FROM tour_revision_file WHERE tour_id=$1 AND revision=$2 ORDER BY file_id",
        [id, r.published_revision],
      )
    ).rows;
  return {
    id: r.id,
    agencyId: r.agency_id,
    agencyName: r.agency_name,
    revision: r.published_revision,
    payload: publicPayload(r.payload,r.display_title),
    priceUnit: r.payload.mode === "GROUP" ? "PER_PERSON" : "PER_PARTY",
    schedules,
    scheduleTotal,
    page: q.page,
    pageCount: Math.max(1, Math.ceil(scheduleTotal / 20)),
    photos,
  };
}
export async function listTours(actor: Actor, agencyId: string, page = 1) {
  uuid.parse(agencyId);
  z.number().int().min(1).max(10000).parse(page);
  return transaction(async (c) => {
    const user = await storedActor(actor, c),
      agency = await agencyOperatingContext(c, user, agencyId);
    if (!agency.operatesAgency)
      throw new DomainError("Active agency access required.", 403);
    const total = Number(
      (
        await c.query(
          "SELECT count(*) AS n FROM tour_package WHERE agency_id=$1",
          [agencyId],
        )
      ).rows[0].n,
    );
    const rows = (
      await c.query<TourRow>(
        "SELECT * FROM tour_package WHERE agency_id=$1 ORDER BY updated_at DESC,id LIMIT 12 OFFSET $2",
        [agencyId, (page - 1) * 12],
      )
    ).rows;
    return {
      items: rows.map(view),
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / 12)),
    };
  });
}
export async function publicTours(input: unknown = {}) {
  const q = tourSearchSchema.parse(input),
    pattern = `%${q.search.replace(/[\\%_]/g, "\\$&")}%`;
  const cost =
    "((r.payload->>'priceCentavos')::bigint*CASE WHEN r.mode='GROUP' THEN COALESCE($4::int,(r.payload->>'minParty')::int) ELSE 1 END)";
  const party = "COALESCE($4::int,(r.payload->>'minParty')::int)";
  const available = `EXISTS(SELECT 1 FROM tour_schedule s WHERE s.tour_id=t.id AND s.revision=t.published_revision AND s.status='SCHEDULED' AND s.cutoff_at>now() AND ($6::date IS NULL OR (s.start_at AT TIME ZONE 'Asia/Manila')::date>=$6::date) AND ($7::date IS NULL OR (s.start_at AT TIME ZONE 'Asia/Manila')::date<=$7::date) AND CASE WHEN r.mode='PRIVATE' THEN s.capacity>=${party} AND s.reserved_units=0 ELSE s.capacity-s.reserved_units>=${party} END)`;
  const filter = `${visible} AND (COALESCE(t.display_title,r.payload->>'title') ILIKE $1 OR (r.payload->>'serviceArea') ILIKE $1) AND ($2::uuid IS NULL OR t.agency_id=$2) AND ($3::text IS NULL OR r.mode=$3) AND ($4::int IS NULL OR ((r.payload->>'minParty')::int<=$4 AND (r.payload->>'maxParty')::int>=$4 AND ${cost}<=100000000)) AND (($4::int IS NULL AND $6::date IS NULL AND $7::date IS NULL) OR ${available}) AND ($5::int IS NULL OR (r.payload->>'priceCentavos')::int<=$5)`;
  const values = [
    pattern,
    q.agencyId ?? null,
    q.mode ?? null,
    q.partySize ?? null,
    q.maxPriceCentavos ?? null,
    q.dateFrom ?? null,
    q.dateTo ?? null,
  ];
  const total = Number(
    (
      await db.query(
        `SELECT count(*) AS n ${publicJoin} WHERE ${filter}`,
        values,
      )
    ).rows[0].n,
  );
  let order =
    q.sort === "NAME"
      ? "lower(COALESCE(t.display_title,r.payload->>'title')),t.id"
      : q.sort === "RECOMMENDED"
        ? `${cost} ASC,t.id`
        : `(r.payload->>'priceCentavos')::int ${q.sort === "PRICE_ASC" ? "ASC" : "DESC"},t.id`;
  const rowValues = [...values];
  if (q.sort === "RECOMMENDED" && q.budgetCentavos) {
    rowValues.push(q.budgetCentavos);
    order = `(${cost}<= $${rowValues.length}::bigint) DESC,${order}`;
  }
  const rows = (
    await db.query(
      `SELECT t.id,t.agency_id,r.payload,t.display_title,COALESCE(a.display_name,ar.payload->>'businessName') AS agency_name,${cost} AS party_cost,(SELECT file_id FROM tour_revision_file WHERE tour_id=t.id AND revision=t.published_revision ORDER BY file_id LIMIT 1) AS photo_id ${publicJoin} WHERE ${filter} ORDER BY ${order} LIMIT $${rowValues.length + 1} OFFSET $${rowValues.length + 2}`,
      [...rowValues, q.pageSize, (q.page - 1) * q.pageSize],
    )
  ).rows;
  return {
    items: rows.map((r) => {
      const estimatedServiceCentavos = q.partySize
          ? Number(r.party_cost)
          : null,
        reasons: string[] = [];
      if (q.partySize || q.dateFrom || q.dateTo)
        reasons.push(
          "A published date has capacity for the requested party and departure range.",
        );
      else reasons.push("Select guests and departure dates to check capacity.");
      if (q.partySize)
        reasons.push(
          r.payload.mode === "GROUP"
            ? `Per-person rate multiplied by ${q.partySize} guests.`
            : "The private rate is charged once for the whole party.",
        );
      if (q.budgetCentavos && estimatedServiceCentavos !== null)
        reasons.push(
          estimatedServiceCentavos <= q.budgetCentavos
            ? "Service estimate fits your preferred budget."
            : "Service estimate exceeds your preferred budget.",
        );
      return {
        id: String(r.id),
        agencyId: String(r.agency_id),
        agencyName: String(r.agency_name),
        title: String(r.display_title??r.payload.title),
        mode: r.payload.mode as TourInput["mode"],
        serviceArea: String(r.payload.serviceArea),
        priceCentavos: Number(r.payload.priceCentavos),
        minParty: Number(r.payload.minParty),
        maxParty: Number(r.payload.maxParty),
        photoId: String(r.photo_id),
        estimatedServiceCentavos,
        reasons,
      };
    }),
    total,
    page: q.page,
    pageCount: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}
const photoSchema = z
  .object({
    id: uuid,
    name: z.string().min(1).max(160),
    mime: z.enum(["image/png", "image/jpeg"]),
    size: z.number().int().positive().max(8388608),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    backend: z.enum(["local", "s3"]),
  })
  .strict();
export async function authorizeTourUpload(
  actor: Actor,
  id: string,
  version: number,
) {
  return transaction(async (c) => {
    const { row } = await context(c, actor, id, true);
    expected(row, version);
    editable(row);
    return { tourId: id };
  });
}
export async function attachTourPhoto(
  actor: Actor,
  id: string,
  version: number,
  input: unknown,
) {
  const data = photoSchema.parse(input);
  return transaction(async (c) => {
    const { row, user } = await context(c, actor, id, true);
    expected(row, version);
    editable(row);
    const count = Number(
      (
        await c.query(
          "SELECT count(*) AS n FROM tour_file WHERE tour_id=$1 AND is_current",
          [id],
        )
      ).rows[0].n,
    );
    if (count >= 12)
      throw new DomainError("Keep up to 12 current package photos.");
    await c.query(
      "INSERT INTO tour_file(id,tour_id,uploader_id,object_key,original_name,mime,size_bytes,sha256,backend)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        data.id,
        id,
        user.id,
        `${id}/${data.id}`,
        data.name,
        data.mime,
        data.size,
        data.sha256,
        data.backend,
      ],
    );
    await c.query(
      "UPDATE tour_package SET version=version+1,updated_at=now() WHERE id=$1",
      [id],
    );
    await audit(c, user, "TOUR_PHOTO_ATTACHED", id, { fileId: data.id });
    return { id: data.id, version: version + 1 };
  });
}
export async function removeTourPhoto(
  actor: Actor,
  id: string,
  version: number,
  fileId: string,
) {
  uuid.parse(fileId);
  return transaction(async (c) => {
    const { row, user } = await context(c, actor, id, true);
    expected(row, version);
    editable(row);
    if (
      !(
        await c.query(
          "UPDATE tour_file SET is_current=false WHERE tour_id=$1 AND id=$2 AND is_current RETURNING id",
          [id, fileId],
        )
      ).rowCount
    )
      throw new DomainError("Current tour photo not found.", 404);
    await c.query(
      "UPDATE tour_package SET version=version+1,updated_at=now() WHERE id=$1",
      [id],
    );
    await audit(c, user, "TOUR_PHOTO_REMOVED", id, { fileId });
    return { version: version + 1 };
  });
}
export async function tourPhotoForRead(actor: Actor | null, id: string) {
  if (!uuid.safeParse(id).success)
    throw new DomainError("Photo not found.", 404);
  return transaction(async (c) => {
    const f = (await c.query("SELECT * FROM tour_file WHERE id=$1", [id]))
      .rows[0];
    if (!f) throw new DomainError("Photo not found.", 404);
    const published = Boolean(
      (
        await c.query(
          `SELECT 1 ${publicJoin} JOIN tour_revision_file rf ON rf.tour_id=t.id AND rf.revision=t.published_revision WHERE ${visible} AND rf.file_id=$1`,
          [id],
        )
      ).rowCount,
    );
    if (!published) {
      if (!actor) throw new DomainError("Photo not found.", 404);
      const { user } = await context(c, actor, f.tour_id);
      await audit(c, user, "TOUR_PRIVATE_PHOTO_DOWNLOADED", f.tour_id, {
        fileId: id,
      });
    }
    return {
      objectKey: String(f.object_key),
      mime: String(f.mime),
      name: String(f.original_name),
      backend: String(f.backend),
      public: published,
    };
  });
}
