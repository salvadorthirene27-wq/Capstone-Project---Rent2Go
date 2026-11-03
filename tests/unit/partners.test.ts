import { describe, it, expect } from "vitest";
import {
  completeApplicationSchema,
  defaultApplication,
  draftApplicationSchema,
} from "../../src/modules/partners/schema";
import { authorizeTransition } from "../../src/modules/partners/workflow";

export function validApplication() {
  return {
    ...defaultApplication,
    businessName: "Sample Agency",
    legalName: "Sample Agency Ltd",
    representative: "Demo Representative",
    email: "partner@example.test",
    phone: "+639171234567",
    address: "Sample office, Albay",
    serviceAreas: "Albay",
    registrationNumber: "DEMO-REG-001",
    services: ["SELF_DRIVE"],
    eligibilityTerms: "Valid identity and driving license required.",
    terms: "Return the vehicle on the agreed schedule.",
    cancellationPolicy: "Requests are reviewed before release.",
    refundPolicy: "Refunds require approval and evidence.",
    damagePolicy: "Damage is documented during return review.",
    latePolicy: "Late fees are itemized in the quotation.",
    inclusions: "Vehicle rental",
    exclusions: "Fuel and toll charges",
    supportContact: "support@example.test",
    dailyRateCentavos: 200000,
    depositCentavos: 300000,
    holdHours: 24,
    bufferMinutes: 30,
    acceptedMethods: ["CASH", "GCASH"],
    gcashInstructions: "Present the receipt for manual verification.",
    gcashAccountName: "Sample Agency",
    platformPaymentMethod: "DEMO_GCASH",
    settlementSchedule: "WEEKLY",
    consent: true,
  };
}

describe("partner application", () => {
  it("accepts a complete application and preserves 70/10/10/10 defaults", () => {
    const result = completeApplicationSchema.parse(validApplication());
    expect(result.split).toEqual({
      cosigner: 7000,
      agency: 1000,
      platform: 1000,
      maintenance: 1000,
    });
    expect(result.businessName).toBe("Sample Agency");
  });
  it.each([9999, 10001])("rejects allocation total %s", (total) => {
    const input = validApplication();
    input.split = {
      cosigner: total - 3000,
      agency: 1000,
      platform: 1000,
      maintenance: 1000,
    };
    expect(completeApplicationSchema.safeParse(input).success).toBe(false);
  });
  it("accepts configurable allocations but rejects negative or fractional basis points", () => {
    const input = validApplication();
    input.split = {
      cosigner: 6500,
      agency: 1500,
      platform: 1000,
      maintenance: 1000,
    };
    expect(completeApplicationSchema.safeParse(input).success).toBe(true);
    input.split.cosigner = -1;
    expect(completeApplicationSchema.safeParse(input).success).toBe(false);
    input.split.cosigner = 6500.5;
    expect(completeApplicationSchema.safeParse(input).success).toBe(false);
  });
  it("allows incomplete drafts but requires policies, prices and consent at submission", () => {
    expect(draftApplicationSchema.safeParse(defaultApplication).success).toBe(
      true,
    );
    expect(
      completeApplicationSchema.safeParse(defaultApplication).success,
    ).toBe(false);
    const input = validApplication();
    input.terms = "   ";
    expect(completeApplicationSchema.safeParse(input).success).toBe(false);
    input.terms = "Full terms for review.";
    input.consent = false;
    expect(completeApplicationSchema.safeParse(input).success).toBe(false);
  });
  it("permits an explicit zero deposit but rejects an unset deposit", () => {
    const input = validApplication();
    input.depositCentavos = 0;
    expect(completeApplicationSchema.safeParse(input).success).toBe(true);
    expect(
      completeApplicationSchema.safeParse({ ...input, depositCentavos: null })
        .success,
    ).toBe(false);
  });
  it("requires GCash instructions and rejects unknown fields and fake methods", () => {
    expect(
      completeApplicationSchema.safeParse({
        ...validApplication(),
        gcashInstructions: "",
      }).success,
    ).toBe(false);
    expect(
      draftApplicationSchema.safeParse({
        ...defaultApplication,
        role: "SUPER_ADMIN",
      }).success,
    ).toBe(false);
    expect(
      completeApplicationSchema.safeParse({
        ...validApplication(),
        acceptedMethods: ["LIVE_CARD"],
      }).success,
    ).toBe(false);
  });
  it("requires tour prices for the tour models selected", () => {
    const input = {
      ...validApplication(),
      services: ["GROUP_TOUR", "PRIVATE_TOUR"],
    };
    expect(completeApplicationSchema.safeParse(input).success).toBe(false);
    expect(
      completeApplicationSchema.safeParse({
        ...input,
        perPersonCentavos: 100000,
        perPartyCentavos: 500000,
      }).success,
    ).toBe(true);
  });
});

describe("partner transition authorization", () => {
  const owner = { id: "owner", role: "RENTER" as const };
  const admin = { id: "admin", role: "SUPER_ADMIN" as const };
  const app = { ownerId: "owner", status: "DRAFT" as const, version: 2 };
  it("allows the owner to save a draft", () =>
    expect(() => authorizeTransition(owner, app, "SAVE", 2)).not.toThrow());
  it("rejects another owner's application and forged review permissions", () => {
    expect(() =>
      authorizeTransition({ ...owner, id: "other" }, app, "SAVE", 2),
    ).toThrow(/access/i);
    expect(() =>
      authorizeTransition(
        owner,
        { ...app, status: "SUBMITTED" },
        "APPROVE",
        2,
        "Approved",
      ),
    ).toThrow(/access/i);
  });
  it("rejects stale updates and edits to submitted applications", () => {
    expect(() => authorizeTransition(owner, app, "SAVE", 1)).toThrow(
      /changed/i,
    );
    expect(() =>
      authorizeTransition(owner, { ...app, status: "SUBMITTED" }, "SAVE", 2),
    ).toThrow(/status/i);
  });
  it("requires reviewer reason and forbids self-approval", () => {
    expect(() =>
      authorizeTransition(
        admin,
        { ...app, status: "SUBMITTED" },
        "REJECT",
        2,
        "",
      ),
    ).toThrow(/reason/i);
    expect(() =>
      authorizeTransition(
        { ...admin, id: "owner" },
        { ...app, status: "SUBMITTED" },
        "APPROVE",
        2,
        "Approved",
      ),
    ).toThrow(/own/i);
  });
  it("supports correction/resubmission but cannot re-review an approved version", () => {
    expect(() =>
      authorizeTransition(
        owner,
        { ...app, status: "CHANGES_REQUESTED" },
        "SUBMIT",
        2,
      ),
    ).not.toThrow();
    expect(() =>
      authorizeTransition(
        admin,
        { ...app, status: "APPROVED" },
        "REJECT",
        2,
        "Reject",
      ),
    ).toThrow(/status/i);
  });
});
