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
export function holdExpiry(now: number, lines: { holdHours: number; startAt: string; cutoffAt?: string }[]) {
  const limit = Math.min(...lines.flatMap(l => [now + l.holdHours * 3600000, Date.parse(l.startAt), ...(l.cutoffAt ? [Date.parse(l.cutoffAt)] : [])]));
  if (!lines.length || !Number.isFinite(limit) || limit <= now || lines.some(l => !Number.isFinite(l.holdHours) || l.holdHours <= 0)) throw new DomainError("This service no longer allows a future quotation hold. Submit a new request.", 409);
  return new Date(limit).toISOString();
}
export function quotationFinancial(saved: Record<string, unknown>, estimate: { serviceCentavos: number; refundableDepositCentavos: number; driverCentavos?: number }) {
  if (![estimate.serviceCentavos, estimate.refundableDepositCentavos, estimate.serviceCentavos + estimate.refundableDepositCentavos].every(v => Number.isSafeInteger(v) && v >= 0)) throw new DomainError("Invalid saved quotation amount.", 409);
  const { driverCompensation: _old, ...rest } = saved;
  return { ...rest, allocationBasis: "SERVICE_REVENUE_EXCLUDING_REFUNDABLE_DEPOSIT", serviceRevenueCentavos: estimate.serviceCentavos, driverFeeIncluded: true, driverFeeCentavos: estimate.driverCentavos ?? 0 };
}
