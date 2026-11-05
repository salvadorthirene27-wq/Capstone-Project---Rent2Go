import { z } from "zod";
import { uuid, versionSchema } from "../../lib/http";
import { digest } from "../cart/pricing";
import { DomainError } from "../partners/workflow";
const reason = z.string().trim().min(1).max(2000);
const exact = { version: versionSchema, quoteId: uuid, digest: z.string().regex(/^[a-f0-9]{64}$/) };
export const quotationCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ISSUE_QUOTE"), version: versionSchema, drivers: z.array(z.object({ lineId: uuid, driverId: uuid }).strict()).max(20) }).strict(),
  z.object({ action: z.literal("ACCEPT_QUOTE"), ...exact }).strict(),
  z.object({ action: z.literal("DECLINE_QUOTE"), ...exact, reason }).strict(),
  z.object({ action: z.literal("WITHDRAW_QUOTE"), ...exact, reason }).strict(),
  z.object({ action: z.literal("REJECT"), version: versionSchema, reason }).strict(),
]);
export const quotationDigest = digest;
export function quotationPolicies(lineId: string, kind: string, agency: Record<string, unknown>, service: Record<string, unknown>) {
  const text = (value: unknown) => typeof value === "string" ? value : "";
  const rental = kind === "RENTAL";
  const listing = rental ? (service.terms ?? {}) as Record<string, unknown> : service;
  const clause = (label: string, value: unknown) => text(value) ? `${label}:\n${text(value)}` : "";
  const join = (...values: string[]) => values.filter(Boolean).join("\n\n");
  // Consignment agreementTerms belong to the owner and agency, not the renter.
  const terms = join(clause("Agency service terms", agency.terms), clause("Agency eligibility", agency.eligibilityTerms), clause("Agency inclusions", agency.inclusions), clause("Agency exclusions", agency.exclusions), ...(!rental ? [clause("Tour service terms", listing.terms), clause("Tour eligibility", listing.eligibilityTerms)] : []), clause("Listing inclusions", listing.inclusions), clause("Listing exclusions", listing.exclusions), rental ? clause("Pickup instructions", (service.facts as Record<string, unknown> | undefined)?.pickupInstructions) : "");
  const combined = (key: string) => join(clause("Agency policy", agency[key]), !rental ? clause("Tour policy", listing[key]) : "");
  return { lineId, terms, cancellationPolicy: combined("cancellationPolicy"), refundPolicy: combined("refundPolicy"), damagePolicy: combined("damagePolicy"), latePolicy: combined("latePolicy") };
}
export function holdExpiry(now: number, lines: {
  holdHours: number;
  startAt: string;
  cutoffAt?: string;
}[]) {
  const limit = Math.min(...lines.flatMap(l => [now + l.holdHours * 3600000, Date.parse(l.startAt), ...(l.cutoffAt ? [Date.parse(l.cutoffAt)] : [])]));
  if (!lines.length || !Number.isFinite(limit) || limit <= now || lines.some(l => !Number.isFinite(l.holdHours) || l.holdHours <= 0))
    throw new DomainError("This service no longer allows a future quotation hold. Submit a new request.", 409);
  return new Date(limit).toISOString();
}
export function quotationFinancial(saved: Record<string, unknown>, estimate: {
  serviceCentavos: number;
  refundableDepositCentavos: number;
  driverCentavos?: number;
}) {
  if (![estimate.serviceCentavos, estimate.refundableDepositCentavos, estimate.serviceCentavos + estimate.refundableDepositCentavos].every(v => Number.isSafeInteger(v) && v >= 0))
    throw new DomainError("Invalid saved quotation amount.", 409);
  const { driverCompensation: _old, ...rest } = saved;
  return { ...rest, allocationBasis: "SERVICE_REVENUE_EXCLUDING_REFUNDABLE_DEPOSIT", serviceRevenueCentavos: estimate.serviceCentavos, driverFeeIncluded: true, driverFeeCentavos: estimate.driverCentavos ?? 0 };
}
