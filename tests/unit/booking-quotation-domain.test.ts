import { expect, it } from "vitest";
import { quotationCommand, holdExpiry, quotationFinancial, quotationDigest } from "../../src/modules/bookings/quotation-schema";

it("bounds a hold by its shortest saved policy, service start and cutoff", () => {
  const now = Date.parse("2031-01-01T00:00:00Z");
  expect(holdExpiry(now, [{ holdHours: 24, startAt: "2031-01-02T10:00:00Z" }, { holdHours: 4, startAt: "2031-01-02T00:00:00Z", cutoffAt: "2031-01-01T02:00:00Z" }])).toBe("2031-01-01T02:00:00.000Z");
  expect(() => holdExpiry(now, [{ holdHours: 4, startAt: "2030-01-01T00:00:00Z" }])).toThrow();
});
it("includes driver fees in service revenue and excludes refundable deposits", () => {
  const result = quotationFinancial({ shares: { agency: 8000, platform: 2000 }, driverCompensation: "REQUIRES_SEPARATE_QUOTE_RULE" }, { serviceCentavos: 12500, driverCentavos: 2500, refundableDepositCentavos: 8000 });
  expect(result).toMatchObject({ shares: { agency: 8000, platform: 2000 }, allocationBasis: "SERVICE_REVENUE_EXCLUDING_REFUNDABLE_DEPOSIT", serviceRevenueCentavos: 12500, driverFeeIncluded: true });
  expect(result).not.toHaveProperty("driverCompensation", "REQUIRES_SEPARATE_QUOTE_RULE");
  expect(() => quotationFinancial({}, { serviceCentavos: Number.MAX_SAFE_INTEGER + 1, refundableDepositCentavos: 0 })).toThrow();
});
it("binds exact quote content with canonical digests and strict commands", () => {
  expect(quotationDigest({ b: 1, a: 2 })).toBe(quotationDigest({ a: 2, b: 1 }));
  expect(quotationDigest({ a: 2, b: 1 })).not.toBe(quotationDigest({ a: 3, b: 1 }));
  expect(quotationCommand.safeParse({ action: "ISSUE_QUOTE", version: 1, drivers: [], amount: 1 }).success).toBe(false);
  expect(quotationCommand.safeParse({ action: "REJECT", version: 1, reason: "  " }).success).toBe(false);
  expect(quotationCommand.safeParse({ action: "ACCEPT_QUOTE", version: 1 }).success).toBe(false);
});
