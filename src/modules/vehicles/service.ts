import { randomUUID, createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { db, transaction } from "../../lib/db";
import { storedActor, audit } from "../partners/service";
import {
  draftApplicationSchema,
  type ApplicationInput,
} from "../partners/schema";
import { DomainError, type Actor } from "../partners/workflow";
import {
  createVehicleSchema,
  vehicleFactsSchema,
  vehicleActionSchema,
  validatedTerms,
  type VehicleFacts,
  type VehicleTerms,
} from "./schema";
import {
  normalizeRegistration,
  defaultVehicleShares,
  decideVehicleTransition,
  type VehicleState,
  type VehicleOwnership,
} from "./workflow";
import { z } from "zod";
type OfferRow = {
  id: string;
  vehicle_id: string;
  agency_id: string;
  ownership: VehicleOwnership;
  owner_actor_id: string | null;
  owner_agency_id: string | null;
  registration_normalized: string;
  state: VehicleState;
  version: number;
  revision: number;
  approved_revision: number | null;
  draft_facts: VehicleFacts;
  draft_terms: VehicleTerms;
};
const offerSelect =
  "SELECT o.*,v.ownership,v.owner_actor_id,v.owner_agency_id,v.registration_normalized FROM vehicle_offer o JOIN physical_vehicle v ON v.id=o.vehicle_id";
const idSchema = z.uuid();
function view(r: OfferRow) {
  return {
    id: r.id,
    vehicleId: r.vehicle_id,
    agencyId: r.agency_id,
    ownership: r.ownership,
    ownerId: r.owner_actor_id,
    registration: r.registration_normalized,
    state: r.state,
    version: r.version,
    revision: r.revision,
    approvedRevision: r.approved_revision,
    facts: r.draft_facts,
    terms: r.draft_terms,
  };
}
async function actorInTransaction(c: PoolClient, actor: Actor) {
  await c.query("SELECT id FROM app_actor WHERE id=$1 FOR SHARE", [actor.id]);
  return storedActor(actor, c);
}
async function agencyContext(c: PoolClient, actor: Actor, id: string) {
  const row = (
    await c.query(
      "SELECT a.*,ao.suspended,ao.is_test_fixture,r.payload FROM agency a JOIN app_actor ao ON ao.id=a.owner_id JOIN partner_revision r ON r.application_id=a.application_id AND r.revision=a.approved_revision WHERE a.id=$1 FOR SHARE OF a,ao",
      [id],
    )
  ).rows[0];
  if (!row) throw new DomainError("Agency not found.", 404);
  const member = (
    await c.query(
      "SELECT active FROM agency_member WHERE agency_id=$1 AND actor_id=$2 FOR SHARE",
      [id, actor.id],
    )
  ).rows[0];
  const active = Boolean(row.active && !row.suspended && !row.is_test_fixture);
  return {
    active,
    operatesAgency:
      active && (row.owner_id === actor.id || Boolean(member?.active)),
    policy: draftApplicationSchema.parse(row.payload),
    revision: Number(row.approved_revision),
  };
}
async function findOffer(c: PoolClient, id: string, lock = false) {
  if (!idSchema.safeParse(id).success)
    throw new DomainError("Vehicle offer not found.", 404);
  const row = (
    await c.query<OfferRow>(
      `${offerSelect} WHERE o.id=$1 ${lock ? "FOR UPDATE OF o" : ""}`,
      [id],
    )
  ).rows[0];
  if (!row) throw new DomainError("Vehicle offer not found.", 404);
  return row;
}
function ownerCapability(actor: Actor, row: OfferRow, operatesAgency: boolean) {
  return row.ownership === "CONSIGNED"
    ? row.owner_actor_id === actor.id
    : operatesAgency;
}
function ensureServiceModes(policy: ApplicationInput, terms: VehicleTerms) {
  if (terms.modes.some((m) => !policy.services.includes(m)))
    throw new DomainError(
      "This agency is not approved for every selected rental mode.",
    );
}
export async function createVehicleOffer(actor: Actor, input: unknown) {
  const data = createVehicleSchema.parse(input),
    registration = normalizeRegistration(data.registration);
  try {
    return await transaction(async (c) => {
      const user = await actorInTransaction(c, actor),
        context = await agencyContext(c, user, data.agencyId);
      if (!context.active)
        throw new DomainError("Choose an active approved agency.", 403);
      if (data.ownership === "AGENCY_OWNED" && !context.operatesAgency)
        throw new DomainError("You do not operate this agency.", 403);
      const p = context.policy,
        modes = p.services.filter(
          (s): s is "SELF_DRIVE" | "WITH_DRIVER" =>
            s === "SELF_DRIVE" || s === "WITH_DRIVER",
        );
      if (!modes.length)
        throw new DomainError("Choose an agency approved for vehicle rentals.");
      const terms: VehicleTerms = {
        rateCentavos: p.dailyRateCentavos ?? 0,
        depositCentavos: p.depositCentavos ?? 0,
        billingUnit: p.billingUnit,
        modes,
        driverFeeCentavos: p.driverFeeCentavos,
        inclusions: p.inclusions,
        exclusions: p.exclusions,
        agreementTerms: p.terms,
        shares:
          data.ownership === "CONSIGNED"
            ? p.split
            : defaultVehicleShares("AGENCY_OWNED"),
        allocationBasis: "SERVICE_REVENUE_EXCLUDING_REFUNDABLE_DEPOSIT",
      };
      const vehicleId = randomUUID(),
        offerId = randomUUID();
      await c.query(
        "INSERT INTO physical_vehicle(id,ownership,owner_actor_id,owner_agency_id,registration_normalized) VALUES($1,$2,$3,$4,$5)",
        [
          vehicleId,
          data.ownership,
          data.ownership === "CONSIGNED" ? user.id : null,
          data.ownership === "AGENCY_OWNED" ? data.agencyId : null,
          registration,
        ],
      );
      await c.query(
        "INSERT INTO vehicle_offer(id,vehicle_id,agency_id,draft_facts,draft_terms) VALUES($1,$2,$3,$4,$5)",
        [
          offerId,
          vehicleId,
          data.agencyId,
          JSON.stringify(data.facts),
          JSON.stringify(terms),
        ],
      );
      await audit(c, user, "VEHICLE_DRAFT_CREATED", offerId, {
        vehicleId,
        ownership: data.ownership,
      });
      return view(await findOffer(c, offerId));
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23505")
      throw new DomainError(
        "This vehicle registration is already recorded. Ask for an ownership review instead of creating another car.",
        409,
      );
    throw e;
  }
}
export async function vehicleDetail(actor: Actor, id: string) {
  return transaction(async (c) => {
    const user = await actorInTransaction(c, actor),
      row = await findOffer(c, id),
      context = await agencyContext(c, user, row.agency_id);
    if (
      !ownerCapability(user, row, context.operatesAgency) &&
      !context.operatesAgency &&
      user.role !== "SUPER_ADMIN"
    )
      throw new DomainError("Vehicle offer not found.", 404);
    const revisions = (
      await c.query(
        "SELECT revision,facts,terms,agency_policy_revision,digest,created_at FROM vehicle_revision WHERE offer_id=$1 ORDER BY revision",
        [id],
      )
    ).rows;
    const agreements = (
      await c.query(
        "SELECT revision,signer_id,digest,accepted_at FROM vehicle_agreement WHERE offer_id=$1 ORDER BY revision",
        [id],
      )
    ).rows;
    const events = (
      await c.query(
        "SELECT action,previous_state,next_state,revision,reason,created_at FROM vehicle_event WHERE offer_id=$1 ORDER BY created_at,id",
        [id],
      )
    ).rows;
    const files = (
      await c.query(
        "SELECT id,purpose,original_name,mime,size_bytes,is_current FROM vehicle_file WHERE vehicle_id=$1 ORDER BY created_at,id",
        [row.vehicle_id],
      )
    ).rows;
    return { ...view(row), revisions, agreements, events, files };
  });
}
export async function saveVehicleDraft(
  actor: Actor,
  id: string,
  version: number,
  input: unknown,
) {
  const data = z
    .object({ facts: vehicleFactsSchema, terms: z.unknown() })
    .strict()
    .parse(input);
  return transaction(async (c) => {
    // Lock the offer before actor rows so owner retries cannot deadlock role promotion.
    const row = await findOffer(c, id, true),
      user = await actorInTransaction(c, actor),
      context = await agencyContext(c, user, row.agency_id);
    if (!ownerCapability(user, row, context.operatesAgency))
      throw new DomainError("Only the vehicle owner can edit this draft.", 403);
    if (row.version !== version)
      throw new DomainError(
        "This draft changed. Reload it before saving.",
        409,
      );
    if (!["DRAFT", "CHANGES_REQUESTED"].includes(row.state))
      throw new DomainError("This vehicle revision is locked for review.", 409);
    const terms = validatedTerms(row.ownership, data.terms);
    ensureServiceModes(context.policy, terms);
    await c.query(
      "UPDATE vehicle_offer SET draft_facts=$2,draft_terms=$3,version=version+1,updated_at=now() WHERE id=$1",
      [id, JSON.stringify(data.facts), JSON.stringify(terms)],
    );
    await audit(c, user, "VEHICLE_DRAFT_SAVED", id);
    return view(await findOffer(c, id));
  });
}
async function snapshot(
  c: PoolClient,
  user: Actor,
  row: OfferRow,
  context: { revision: number },
  facts: VehicleFacts,
  terms: VehicleTerms,
  copyFrom?: number,
) {
  const revision = row.revision + 1;
  const files =
    copyFrom === undefined
      ? (
          await c.query(
            "SELECT id,sha256,purpose FROM vehicle_file WHERE vehicle_id=$1 AND is_current ORDER BY id",
            [row.vehicle_id],
          )
        ).rows
      : (
          await c.query(
            "SELECT f.id,f.sha256,f.purpose FROM vehicle_revision_file rf JOIN vehicle_file f ON f.id=rf.file_id WHERE rf.offer_id=$1 AND rf.revision=$2 ORDER BY f.id",
            [row.id, copyFrom],
          )
        ).rows;
  if (
    !files.some((f) => f.purpose === "OWNERSHIP") ||
    !files.some((f) => f.purpose === "PHOTO")
  )
    throw new DomainError(
      "Upload ownership evidence and at least one vehicle photo before submitting.",
    );
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        vehicleId: row.vehicle_id,
        agencyId: row.agency_id,
        ownership: row.ownership,
        ownerId: row.owner_actor_id,
        revision,
        agencyPolicyRevision: context.revision,
        facts,
        terms,
        files,
      }),
    )
    .digest("hex");
  await c.query(
    "INSERT INTO vehicle_revision(offer_id,revision,facts,terms,agency_policy_revision,digest,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [
      row.id,
      revision,
      JSON.stringify(facts),
      JSON.stringify(terms),
      context.revision,
      digest,
      user.id,
    ],
  );
  for (const f of files)
    await c.query(
      "INSERT INTO vehicle_revision_file(offer_id,revision,file_id) VALUES($1,$2,$3)",
      [row.id, revision, f.id],
    );
  return revision;
}
export async function transitionVehicleOffer(
  actor: Actor,
  id: string,
  input: unknown,
) {
  const data = vehicleActionSchema.parse(input);
  return transaction(async (c) => {
    // Lock the offer before actor rows so owner retries cannot deadlock role promotion.
    const row = await findOffer(c, id, true),
      user = await actorInTransaction(c, actor),
      context = await agencyContext(c, user, row.agency_id);
    const next = decideVehicleTransition(
      { ...user, operatesAgency: context.operatesAgency },
      {
        state: row.state,
        ownership: row.ownership,
        ownerId: row.owner_actor_id,
        version: row.version,
        revision: row.revision,
      },
      data.action,
      data.version,
      data.revision,
      data.reason,
    );
    if (
      !context.active &&
      !["UNPUBLISH", "REQUEST_CHANGES", "REJECT"].includes(data.action)
    )
      throw new DomainError(
        "This agency is not active. New submissions and publication are unavailable.",
        409,
      );
    if (data.terms && data.action !== "PROPOSE")
      throw new DomainError(
        "Only an agency proposal can replace the submitted agreement terms.",
      );
    if (["ACCEPT", "APPROVE", "PUBLISH"].includes(data.action))
      ensureServiceModes(
        context.policy,
        validatedTerms(row.ownership, row.draft_terms),
      );
    let revision = row.revision,
      terms = row.draft_terms,
      approvedRevision = row.approved_revision;
    if (data.action === "SUBMIT" || data.action === "PROPOSE") {
      terms = validatedTerms(
        row.ownership,
        data.action === "PROPOSE" ? data.terms : row.draft_terms,
      );
      ensureServiceModes(context.policy, terms);
      revision = await snapshot(
        c,
        user,
        row,
        context,
        vehicleFactsSchema.parse(row.draft_facts),
        terms,
        data.action === "PROPOSE" ? row.revision : undefined,
      );
    }
    if (data.action === "ACCEPT") {
      const rev = (
        await c.query(
          "SELECT digest FROM vehicle_revision WHERE offer_id=$1 AND revision=$2",
          [id, revision],
        )
      ).rows[0];
      await c.query(
        "INSERT INTO vehicle_agreement(offer_id,revision,signer_id,digest) VALUES($1,$2,$3,$4)",
        [id, revision, user.id, rev.digest],
      );
    }
    if (data.action === "APPROVE") {
      if (data.reason.length < 10)
        throw new DomainError(
          "Record why this vehicle complies before approving it.",
        );
      if (
        row.ownership === "CONSIGNED" &&
        !(
          await c.query(
            "SELECT 1 FROM vehicle_agreement a JOIN vehicle_revision r ON r.offer_id=a.offer_id AND r.revision=a.revision WHERE a.offer_id=$1 AND a.revision=$2 AND a.signer_id=$3 AND a.digest=r.digest",
            [id, revision, row.owner_actor_id],
          )
        ).rowCount
      )
        throw new DomainError(
          "The vehicle owner must accept this exact agreement revision.",
          409,
        );
      approvedRevision = revision;
      if (row.ownership === "CONSIGNED")
        await c.query(
          "UPDATE app_actor SET role='COSIGNER' WHERE id=$1 AND role='RENTER'",
          [row.owner_actor_id],
        );
    }
    if (data.action === "AMEND") approvedRevision = null;
    if (data.action === "PUBLISH") {
      if (approvedRevision !== revision)
        throw new DomainError(
          "The current revision has no platform approval.",
          409,
        );
      if (row.owner_actor_id) {
        const owner = (
          await c.query(
            "SELECT suspended,is_test_fixture FROM app_actor WHERE id=$1 FOR SHARE",
            [row.owner_actor_id],
          )
        ).rows[0];
        if (!owner || owner.suspended || owner.is_test_fixture)
          throw new DomainError("The vehicle owner is not active.", 409);
      }
    }
    await c.query(
      "UPDATE vehicle_offer SET state=$2,revision=$3,draft_terms=$4,approved_revision=$5,version=version+1,updated_at=now() WHERE id=$1",
      [id, next, revision, JSON.stringify(terms), approvedRevision],
    );
    await c.query(
      "INSERT INTO vehicle_event(id,offer_id,actor_id,action,previous_state,next_state,revision,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        randomUUID(),
        id,
        user.id,
        data.action,
        row.state,
        next,
        revision,
        data.reason,
      ],
    );
    await audit(c, user, `VEHICLE_${data.action}`, id, {
      revision,
      previousState: row.state,
      nextState: next,
    });
    return view(await findOffer(c, id));
  });
}
export async function publicVehicles() {
  const rows = (
    await db.query(
      "SELECT o.id,o.agency_id,r.facts,r.terms,r.revision FROM vehicle_offer o JOIN physical_vehicle v ON v.id=o.vehicle_id JOIN agency a ON a.id=o.agency_id JOIN partner_revision ar ON ar.application_id=a.application_id AND ar.revision=a.approved_revision JOIN app_actor ao ON ao.id=a.owner_id LEFT JOIN app_actor vo ON vo.id=v.owner_actor_id JOIN vehicle_revision r ON r.offer_id=o.id AND r.revision=o.approved_revision WHERE o.state='PUBLISHED' AND o.revision=o.approved_revision AND (r.terms->'modes') <@ (ar.payload->'services') AND a.active AND NOT ao.suspended AND NOT ao.is_test_fixture AND (v.owner_actor_id IS NULL OR (NOT vo.suspended AND NOT vo.is_test_fixture)) ORDER BY o.id LIMIT 100",
    )
  ).rows;
  return rows.map((row) => {
    const t = row.terms as VehicleTerms;
    return {
      id: row.id,
      agencyId: row.agency_id,
      revision: row.revision,
      facts: row.facts as VehicleFacts,
      pricing: {
        rateCentavos: t.rateCentavos,
        depositCentavos: t.depositCentavos,
        billingUnit: t.billingUnit,
        modes: t.modes,
        driverFeeCentavos: t.driverFeeCentavos,
        inclusions: t.inclusions,
        exclusions: t.exclusions,
      },
    };
  });
}
