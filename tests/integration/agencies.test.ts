import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import {
  myApplication,
  createApplication,
  saveDraft,
  submitApplication,
  reviewApplication,
  startPolicyRevision,
} from "../../src/modules/partners/service";
import {
  defaultApplication,
  type ApplicationInput,
} from "../../src/modules/partners/schema";
import {
  myAgencies,
  requireAgencyAccess,
  publicAgencies,
  publicAgency,
} from "../../src/modules/agencies/service";
import type { Actor } from "../../src/modules/partners/workflow";

const owner: Actor = { id: randomUUID(), role: "RENTER" },
  stranger: Actor = { id: randomUUID(), role: "RENTER" },
  staff: Actor = { id: randomUUID(), role: "RENTER" },
  admin: Actor = { id: randomUUID(), role: "SUPER_ADMIN" };
let agencyId: string, applicationId: string;
const marker = randomUUID().slice(0, 8);
const payload: ApplicationInput = {
  ...defaultApplication,
  businessName: `Public agency ${marker}`,
  legalName: "Private legal company name",
  representative: "Private representative",
  email: "business@example.test",
  phone: "+639171234567",
  address: "Private operating address",
  serviceAreas: "Albay",
  registrationNumber: "PRIVATE-REGISTRATION",
  supportContact: "help@example.test",
  services: ["SELF_DRIVE"],
  eligibilityTerms: "Current identity and license required.",
  terms: "Approved original rental terms.",
  cancellationPolicy: "Pre-release review.",
  refundPolicy: "Refund review and recorded payout.",
  damagePolicy: "Recorded inspections and reviewed deductions.",
  latePolicy: "Agreed itemized charges.",
  inclusions: "Vehicle service",
  exclusions: "Fuel and tolls",
  dailyRateCentavos: 200000,
  depositCentavos: 0,
  holdHours: 24,
  bufferMinutes: 30,
  acceptedMethods: ["CASH"],
  consent: true,
};
beforeAll(async () => {
  if (
    !process.env.TEST_DATABASE_URL ||
    process.env.NEON_PROJECT_ID !== "floral-flower-08375841"
  )
    throw Error("Use the designated isolated test database.");
  for (const a of [owner, stranger, staff, admin])
    await db.query(
      "INSERT INTO app_actor(id,email,name,role) VALUES($1,$2,'Agency test identity',$3)",
      [a.id, `${a.id}@example.test`, a.role],
    );
  const app = await createApplication(owner);
  applicationId = app.id;
  await saveDraft(owner, app.id, payload, 1);
  await db.query(
    "INSERT INTO private_file(id,application_id,owner_id,purpose,object_key,original_name,mime,size_bytes,sha256) VALUES($1,$2,$3,'REGISTRATION',$4,'private-registration.pdf','application/pdf',10,'test')",
    [randomUUID(), app.id, owner.id, `fixture/${randomUUID()}`],
  );
  await submitApplication(owner, app.id, 2);
  await reviewApplication(
    admin,
    app.id,
    3,
    "APPROVE",
    "Approved agency test fixture.",
  );
  agencyId = (
    await db.query("SELECT id FROM agency WHERE application_id=$1", [app.id])
  ).rows[0].id;
});
afterAll(() => db.end());
describe("effective agency storefront and operating context", () => {
  it("discovers only the actor's application without creating drafts", async () => {
    expect(await myApplication(stranger)).toBeNull();
    expect(await myApplication(admin)).toBeNull();
    expect((await myApplication(owner))?.id).toBe(applicationId);
    expect(await myApplication(stranger)).toBeNull();
    await expect(
      requireAgencyAccess(owner, "invalid-id"),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("creates an owner membership and never trusts a submitted primary role", async () => {
    expect(
      (
        await db.query(
          "SELECT count(*) FROM agency_member WHERE agency_id=$1 AND actor_id=$2 AND role='OWNER'",
          [agencyId, owner.id],
        )
      ).rows[0].count,
    ).toBe("1");
    expect((await myAgencies(owner)).some((a) => a.id === agencyId)).toBe(true);
    expect((await requireAgencyAccess(owner, agencyId)).id).toBe(agencyId);
    await expect(
      requireAgencyAccess({ ...stranger, role: "AGENCY_ADMIN" }, agencyId),
    ).rejects.toMatchObject({ status: 403 });
    await expect(requireAgencyAccess(admin, agencyId)).rejects.toMatchObject({
      status: 403,
    });
  });
  it("projects only approved public business fields, excluding private evidence and allocations", async () => {
    const view = await publicAgency(agencyId),
      encoded = JSON.stringify(view);
    expect(view.name).toBe(payload.businessName);
    expect(view.policies.terms).toBe(payload.terms);
    expect(view.contact.email).toBe("business@example.test");
    for (const secret of [
      owner.id,
      payload.registrationNumber,
      payload.representative,
      payload.address,
      "private-registration.pdf",
      "cosigner",
      "gcashAccountName",
    ]) {
      expect(encoded).not.toContain(secret);
    }
  });
  it("keeps draft policy/name changes out of the public profile and operator context", async () => {
    const draft = await startPolicyRevision(owner, applicationId, 4);
    await saveDraft(
      owner,
      applicationId,
      {
        ...payload,
        businessName: "UNAPPROVED NAME",
        terms: "Unapproved replacement terms.",
      },
      draft.version,
    );
    const view = await publicAgency(agencyId);
    expect(view.name).toBe(payload.businessName);
    expect(view.policies.terms).toBe(payload.terms);
    expect((await myAgencies(owner)).find((a) => a.id === agencyId)?.name).toBe(
      payload.businessName,
    );
  });
  it("uses explicit membership and revokes operational access immediately when membership is inactive", async () => {
    await db.query(
      "INSERT INTO agency_member(agency_id,actor_id,role) VALUES($1,$2,'ADMIN')",
      [agencyId, staff.id],
    );
    expect((await requireAgencyAccess(staff, agencyId)).id).toBe(agencyId);
    await db.query(
      "UPDATE agency_member SET active=false WHERE agency_id=$1 AND actor_id=$2",
      [agencyId, staff.id],
    );
    await expect(requireAgencyAccess(staff, agencyId)).rejects.toMatchObject({
      status: 403,
    });
  });
  it("excludes inactive agencies and suspended or internal-fixture owners", async () => {
    await db.query("UPDATE agency SET active=false WHERE id=$1", [agencyId]);
    await expect(publicAgency(agencyId)).rejects.toMatchObject({ status: 404 });
    await expect(requireAgencyAccess(owner, agencyId)).rejects.toMatchObject({
      status: 403,
    });
    await db.query("UPDATE agency SET active=true WHERE id=$1", [agencyId]);
    await db.query("UPDATE app_actor SET suspended=true WHERE id=$1", [
      owner.id,
    ]);
    await expect(publicAgency(agencyId)).rejects.toMatchObject({ status: 404 });
    await db.query(
      "UPDATE app_actor SET suspended=false,is_test_fixture=true WHERE id=$1",
      [owner.id],
    );
    await expect(publicAgency(agencyId)).rejects.toMatchObject({ status: 404 });
    await db.query("UPDATE app_actor SET is_test_fixture=false WHERE id=$1", [
      owner.id,
    ]);
  });
  it("filters and pages approved agencies without treating search characters as wildcards", async () => {
    const found = await publicAgencies({
      search: marker,
      page: 1,
      pageSize: 1,
      service: "SELF_DRIVE",
    });
    expect(found.total).toBe(1);
    expect(found.items[0].id).toBe(agencyId);
    expect(found.pageCount).toBe(1);
    const excluded = await publicAgencies({
      search: marker,
      service: "GROUP_TOUR",
      page: 1,
      pageSize: 12,
    });
    expect(excluded.total).toBe(0);
    expect(
      (await publicAgencies({ search: `${marker}%_`, page: 1, pageSize: 12 }))
        .total,
    ).toBe(0);
  });
});
