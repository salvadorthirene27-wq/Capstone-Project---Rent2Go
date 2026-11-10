import { z } from "zod";
import { DomainError, type Actor } from "../partners/workflow";
export type VehicleOwnership = "CONSIGNED" | "AGENCY_OWNED";
export function requiredVehicleEvidence(ownership: VehicleOwnership, purposes: string[]) {
  const required = ownership === "CONSIGNED" ? ["OWNERSHIP", "DRIVER_LICENSE"] : ["OWNERSHIP", "PHOTO"];
  return required.filter(purpose => !purposes.includes(purpose));
}
export type VehicleState =
  | "DRAFT"
  | "SUBMITTED"
  | "AGREEMENT_PENDING"
  | "COMPLIANCE_REVIEW"
  | "APPROVED"
  | "PUBLISHED"
  | "CHANGES_REQUESTED"
  | "REJECTED"
  | "WITHDRAWN";
export type VehicleAction =
  | "SUBMIT"
  | "PROPOSE"
  | "ACCEPT"
  | "APPROVE"
  | "PUBLISH"
  | "UNPUBLISH"
  | "AMEND"
  | "REQUEST_CHANGES"
  | "REJECT";
const basisPoints = z.number().int().min(0).max(10000);
const sharesSchema = z
  .object({
    cosigner: basisPoints,
    agency: basisPoints,
    platform: basisPoints,
    maintenance: basisPoints,
  })
  .strict();
export type VehicleShares = z.infer<typeof sharesSchema>;
export function defaultVehicleShares(
  ownership: VehicleOwnership,
): VehicleShares {
  return ownership === "CONSIGNED"
    ? { cosigner: 7000, agency: 1000, platform: 1000, maintenance: 1000 }
    : { cosigner: 0, agency: 8000, platform: 1000, maintenance: 1000 };
}
export function validateVehicleShares(
  ownership: VehicleOwnership,
  input: unknown,
) {
  const s = sharesSchema.parse(input);
  if (s.cosigner + s.agency + s.platform + s.maintenance !== 10000)
    throw new DomainError("Revenue shares must total 100%.");
  if (ownership === "CONSIGNED" && s.cosigner === 0)
    throw new DomainError(
      "A consigned vehicle must include the Cosigner's share.",
    );
  if (ownership === "AGENCY_OWNED" && s.cosigner !== 0)
    throw new DomainError(
      "Agency-owned vehicles cannot allocate revenue to a Cosigner.",
    );
  return s;
}
export function normalizeRegistration(input: string) {
  const text = z
      .string()
      .trim()
      .min(3)
      .max(20)
      .regex(/^[A-Za-z0-9 -]+$/)
      .parse(input),
    normalized = text.toUpperCase().replace(/[ -]/g, "");
  if (normalized.length < 3 || normalized.length > 12)
    throw new DomainError("Enter a valid vehicle registration identifier.");
  return normalized;
}
/** Internal capability input: services must derive role, ownership and operatesAgency from locked database records, never a request body. */
export function decideVehicleTransition(
  actor: Actor & { operatesAgency: boolean },
  offer: {
    state: VehicleState;
    ownership: VehicleOwnership;
    ownerId: string | null;
    version: number;
    revision: number;
  },
  action: VehicleAction,
  expectedVersion: number,
  expectedRevision: number,
  reason = "",
): VehicleState {
  if (offer.version !== expectedVersion)
    throw new DomainError(
      "This vehicle offer changed. Reload before continuing.",
      409,
    );
  if (offer.revision !== expectedRevision)
    throw new DomainError(
      "The agreement version changed. Review the current terms before continuing.",
      409,
    );
  const owner =
    offer.ownership === "CONSIGNED"
      ? actor.id === offer.ownerId
      : actor.operatesAgency;
  const independentReviewer =
    actor.role === "SUPER_ADMIN" &&
    !actor.operatesAgency &&
    actor.id !== offer.ownerId;
  const reviewStage =
    (offer.state === "SUBMITTED" && actor.operatesAgency) ||
    (offer.state === "COMPLIANCE_REVIEW" && independentReviewer);
  if (
    ["REQUEST_CHANGES", "REJECT", "UNPUBLISH"].includes(action) &&
    reason.trim().length < 10
  )
    throw new DomainError("Give a clear reason of at least 10 characters.");
  if (
    action === "SUBMIT" &&
    owner &&
    ["DRAFT", "CHANGES_REQUESTED"].includes(offer.state)
  )
    return offer.ownership === "CONSIGNED" ? "SUBMITTED" : "COMPLIANCE_REVIEW";
  if (
    action === "PROPOSE" &&
    actor.operatesAgency &&
    offer.ownership === "CONSIGNED" &&
    offer.state === "SUBMITTED"
  )
    return "AGREEMENT_PENDING";
  if (
    action === "ACCEPT" &&
    offer.ownership === "CONSIGNED" &&
    actor.id === offer.ownerId &&
    offer.state === "AGREEMENT_PENDING"
  )
    return "COMPLIANCE_REVIEW";
  if (
    action === "APPROVE" &&
    independentReviewer &&
    offer.state === "COMPLIANCE_REVIEW"
  )
    return "APPROVED";
  if (
    action === "PUBLISH" &&
    actor.operatesAgency &&
    offer.state === "APPROVED"
  )
    return "PUBLISHED";
  if (
    action === "UNPUBLISH" &&
    offer.state !== "WITHDRAWN" &&
    (owner || actor.operatesAgency || independentReviewer)
  )
    return "WITHDRAWN";
  if (
    action === "AMEND" &&
    owner &&
    ["APPROVED", "REJECTED", "WITHDRAWN"].includes(offer.state)
  )
    return "DRAFT";
  if (action === "REQUEST_CHANGES" && reviewStage) return "CHANGES_REQUESTED";
  if (action === "REJECT" && reviewStage) return "REJECTED";
  throw new DomainError(
    "This vehicle action is not permitted in its current state.",
    403,
  );
}
