import { z } from "zod";
import { db } from "../../lib/db";
import { storedActor } from "../partners/service";
import {
  draftApplicationSchema,
  serviceOptions,
  type ApplicationInput,
} from "../partners/schema";
import { DomainError, type Actor } from "../partners/workflow";

type AgencyRow = {
  id: string;
  owner_id: string;
  approved_revision: number;
  payload: ApplicationInput;
};
const effectiveJoin =
  "FROM agency a JOIN app_actor owner ON owner.id=a.owner_id JOIN partner_revision r ON r.application_id=a.application_id AND r.revision=a.approved_revision";
const visible =
  "a.active AND NOT owner.suspended AND NOT owner.is_test_fixture";
const columns = "a.id,a.owner_id,a.approved_revision,r.payload";

function publicProjection(row: AgencyRow) {
  const p = draftApplicationSchema.parse(row.payload);
  return {
    id: row.id,
    name: p.businessName,
    serviceAreas: p.serviceAreas,
    services: p.services,
    approvedRevision: row.approved_revision,
    contact: { email: p.email, phone: p.phone, support: p.supportContact },
    policies: {
      eligibility: p.eligibilityTerms,
      terms: p.terms,
      cancellation: p.cancellationPolicy,
      refund: p.refundPolicy,
      damage: p.damagePolicy,
      late: p.latePolicy,
    },
    startingRates: {
      billingUnit: p.billingUnit,
      rentalCentavos: p.dailyRateCentavos,
      depositCentavos: p.depositCentavos,
      driverCentavos: p.driverFeeCentavos,
      groupPerPersonCentavos: p.perPersonCentavos,
      privatePerPartyCentavos: p.perPartyCentavos,
      inclusions: p.inclusions,
      exclusions: p.exclusions,
    },
    acceptedMethods: p.acceptedMethods,
  };
}
export type PublicAgency = ReturnType<typeof publicProjection>;
export async function myAgencies(actor: Actor) {
  const user = await storedActor(actor);
  const { rows } = await db.query<AgencyRow>(
    `SELECT ${columns} ${effectiveJoin} LEFT JOIN agency_member m ON m.agency_id=a.id AND m.actor_id=$1 WHERE ${visible} AND (a.owner_id=$1 OR m.active) ORDER BY r.payload->>'businessName',a.id`,
    [user.id],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.payload.businessName,
    approvedRevision: r.approved_revision,
  }));
}
export async function requireAgencyAccess(actor: Actor, agencyId: string) {
  if (!z.uuid().safeParse(agencyId).success)
    throw new DomainError("You do not have active access to this agency.", 403);
  const user = await storedActor(actor);
  const { rows } = await db.query<AgencyRow>(
    `SELECT ${columns} ${effectiveJoin} LEFT JOIN agency_member m ON m.agency_id=a.id AND m.actor_id=$1 WHERE ${visible} AND a.id=$2 AND (a.owner_id=$1 OR m.active)`,
    [user.id, agencyId],
  );
  if (!rows.length)
    throw new DomainError("You do not have active access to this agency.", 403);
  const row = rows[0];
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.payload.businessName,
    approvedRevision: row.approved_revision,
    policy: draftApplicationSchema.parse(row.payload),
  };
}
export const agencySearchSchema = z
  .object({
    search: z.string().trim().max(120).default(""),
    service: z.enum(serviceOptions).optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(48).default(12),
  })
  .strict();
export async function publicAgencies(input: unknown = {}) {
  const query = agencySearchSchema.parse(input),
    pattern = `%${query.search.replace(/[\\%_]/g, "\\$&")}%`;
  const filter = `${visible} AND ((r.payload->>'businessName') ILIKE $1 OR (r.payload->>'serviceAreas') ILIKE $1) AND ($2::text IS NULL OR (r.payload->'services') ? $2::text)`;
  const params = [pattern, query.service ?? null];
  const total = (
    await db.query<{ total: number }>(
      `SELECT count(*)::int total ${effectiveJoin} WHERE ${filter}`,
      params,
    )
  ).rows[0].total;
  const rows = (
    await db.query<AgencyRow>(
      `SELECT ${columns} ${effectiveJoin} WHERE ${filter} ORDER BY lower(r.payload->>'businessName'),a.id LIMIT $3 OFFSET $4`,
      [...params, query.pageSize, (query.page - 1) * query.pageSize],
    )
  ).rows;
  return {
    items: rows.map(publicProjection),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}
export async function publicAgency(id: string) {
  if (!z.uuid().safeParse(id).success)
    throw new DomainError("Agency not found.", 404);
  const { rows } = await db.query<AgencyRow>(
    `SELECT ${columns} ${effectiveJoin} WHERE ${visible} AND a.id=$1`,
    [id],
  );
  if (!rows.length) throw new DomainError("Agency not found.", 404);
  return publicProjection(rows[0]);
}
