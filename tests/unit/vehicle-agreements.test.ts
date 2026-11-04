import { describe, it, expect } from "vitest";
import {
  defaultVehicleShares,
  validateVehicleShares,
  normalizeRegistration,
  decideVehicleTransition,
} from "../../src/modules/vehicles/workflow";
const base = {
  state: "SUBMITTED",
  ownership: "CONSIGNED",
  ownerId: "owner",
  version: 2,
  revision: 1,
} as const;
const owner = { id: "owner", role: "RENTER", operatesAgency: false } as const;
const agency = {
  id: "operator",
  role: "AGENCY_ADMIN",
  operatesAgency: true,
} as const;
const admin = {
  id: "reviewer",
  role: "SUPER_ADMIN",
  operatesAgency: false,
} as const;
describe("vehicle ownership and agreement invariants", () => {
  it("normalizes equivalent registrations and rejects empty or unsafe values", () => {
    expect(normalizeRegistration(" abc 1234 ")).toBe("ABC1234");
    expect(normalizeRegistration("ABC-1234")).toBe("ABC1234");
    for (const plate of ["---", "AB", "ABC<script>", "A".repeat(20)])
      expect(() => normalizeRegistration(plate)).toThrow();
  });
  it("keeps the Cosigner allocation in consigned defaults", () => {
    expect(defaultVehicleShares("CONSIGNED")).toEqual({
      cosigner: 7000,
      agency: 1000,
      platform: 1000,
      maintenance: 1000,
    });
    expect(defaultVehicleShares("AGENCY_OWNED")).toEqual({
      cosigner: 0,
      agency: 8000,
      platform: 1000,
      maintenance: 1000,
    });
    expect(() =>
      validateVehicleShares("CONSIGNED", defaultVehicleShares("AGENCY_OWNED")),
    ).toThrow();
  });
  it("allows agreed changes only with integer basis points, correct recipients, and a total of 100%", () => {
    expect(
      validateVehicleShares("CONSIGNED", {
        cosigner: 6500,
        agency: 1500,
        platform: 1000,
        maintenance: 1000,
      }),
    ).toEqual({
      cosigner: 6500,
      agency: 1500,
      platform: 1000,
      maintenance: 1000,
    });
    for (const shares of [
      { cosigner: 7000, agency: 1000, platform: 1000, maintenance: 900 },
      { cosigner: 6999.5, agency: 1000.5, platform: 1000, maintenance: 1000 },
      { cosigner: -1, agency: 8001, platform: 1000, maintenance: 1000 },
    ])
      expect(() => validateVehicleShares("CONSIGNED", shares)).toThrow();
    expect(() =>
      validateVehicleShares("AGENCY_OWNED", defaultVehicleShares("CONSIGNED")),
    ).toThrow();
  });
  it("lets the assigned agency propose terms but never accept for the owner", () => {
    expect(decideVehicleTransition(agency, base, "PROPOSE", 2, 1)).toBe(
      "AGREEMENT_PENDING",
    );
    expect(() =>
      decideVehicleTransition(
        { ...agency, operatesAgency: false },
        base,
        "PROPOSE",
        2,
        1,
      ),
    ).toThrow();
    const pending = { ...base, state: "AGREEMENT_PENDING" } as const;
    expect(() =>
      decideVehicleTransition(agency, pending, "ACCEPT", 2, 1),
    ).toThrow();
    expect(decideVehicleTransition(owner, pending, "ACCEPT", 2, 1)).toBe(
      "COMPLIANCE_REVIEW",
    );
  });
  it("rejects stale versions and signatures of an older agreement revision", () => {
    const pending = {
      ...base,
      state: "AGREEMENT_PENDING",
      revision: 3,
    } as const;
    expect(() =>
      decideVehicleTransition(owner, pending, "ACCEPT", 1, 3),
    ).toThrow();
    expect(() =>
      decideVehicleTransition(owner, pending, "ACCEPT", 2, 2),
    ).toThrow();
  });
  it("requires independent platform compliance approval and explicit agency publication", () => {
    const review = { ...base, state: "COMPLIANCE_REVIEW" } as const;
    expect(() =>
      decideVehicleTransition(owner, review, "APPROVE", 2, 1),
    ).toThrow();
    expect(() =>
      decideVehicleTransition(
        { ...admin, id: "owner" },
        review,
        "APPROVE",
        2,
        1,
      ),
    ).toThrow();
    expect(() =>
      decideVehicleTransition(
        { ...admin, operatesAgency: true },
        review,
        "APPROVE",
        2,
        1,
      ),
    ).toThrow();
    expect(decideVehicleTransition(admin, review, "APPROVE", 2, 1)).toBe(
      "APPROVED",
    );
    expect(() =>
      decideVehicleTransition(agency, review, "PUBLISH", 2, 1),
    ).toThrow();
    expect(
      decideVehicleTransition(
        agency,
        { ...base, state: "APPROVED" },
        "PUBLISH",
        2,
        1,
      ),
    ).toBe("PUBLISHED");
  });
  it("submits agency-owned cars directly to compliance without inventing a Cosigner agreement", () => {
    const draft = {
      ...base,
      state: "DRAFT",
      ownership: "AGENCY_OWNED",
      ownerId: null,
    } as const;
    expect(decideVehicleTransition(agency, draft, "SUBMIT", 2, 1)).toBe(
      "COMPLIANCE_REVIEW",
    );
    expect(() =>
      decideVehicleTransition(owner, draft, "SUBMIT", 2, 1),
    ).toThrow();
    expect(
      decideVehicleTransition(
        owner,
        { ...base, state: "DRAFT" },
        "SUBMIT",
        2,
        1,
      ),
    ).toBe("SUBMITTED");
  });
  it("requires an explanation for corrections or rejection and preserves reviewer separation", () => {
    expect(() =>
      decideVehicleTransition(agency, base, "REQUEST_CHANGES", 2, 1, ""),
    ).toThrow();
    expect(
      decideVehicleTransition(
        agency,
        base,
        "REQUEST_CHANGES",
        2,
        1,
        "Please replace the unreadable registration evidence.",
      ),
    ).toBe("CHANGES_REQUESTED");
    expect(() =>
      decideVehicleTransition(
        admin,
        base,
        "REJECT",
        2,
        1,
        "Registration does not match.",
      ),
    ).toThrow();
  });
  it("prevents editing a published listing until it is explicitly unpublished", () => {
    const published = { ...base, state: "PUBLISHED" } as const;
    expect(() =>
      decideVehicleTransition(owner, published, "AMEND", 2, 1),
    ).toThrow();
    expect(
      decideVehicleTransition(
        owner,
        published,
        "UNPUBLISH",
        2,
        1,
        "Remove this car from new requests.",
      ),
    ).toBe("WITHDRAWN");
    expect(
      decideVehicleTransition(
        owner,
        { ...base, state: "APPROVED" },
        "AMEND",
        2,
        1,
      ),
    ).toBe("DRAFT");
  });
});

it("does not let an agency republish an owner or platform withdrawal", () => {
  expect(() =>
    decideVehicleTransition(
      agency,
      { ...base, state: "WITHDRAWN" } as const,
      "PUBLISH",
      2,
      1,
    ),
  ).toThrow();
  expect(
    decideVehicleTransition(
      owner,
      { ...base, state: "WITHDRAWN" } as const,
      "AMEND",
      2,
      1,
    ),
  ).toBe("DRAFT");
});

it("allows an owner to withdraw a submitted car before it reaches publication", () => {
  expect(
    decideVehicleTransition(
      owner,
      base,
      "UNPUBLISH",
      2,
      1,
      "I am withdrawing this car from the agency.",
    ),
  ).toBe("WITHDRAWN");
});
