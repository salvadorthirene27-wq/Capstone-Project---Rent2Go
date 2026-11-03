import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import {
  createApplication,
  saveDraft,
  submitApplication,
  reviewApplication,
  getApplication,
  startPolicyRevision,
  withdrawApplication,
} from "../../src/modules/partners/service";
import {
  defaultApplication,
  type ApplicationInput,
} from "../../src/modules/partners/schema";
import type { Actor } from "../../src/modules/partners/workflow";

const owner: Actor = { id: randomUUID(), role: "RENTER" };
const other: Actor = { id: randomUUID(), role: "RENTER" };
const admin: Actor = { id: randomUUID(), role: "SUPER_ADMIN" };
const payload: ApplicationInput = {
  ...defaultApplication,
  businessName: "Demo Agency",
  legalName: "Demo Agency Ltd",
  representative: "Sample Person",
  email: "agency@example.test",
  phone: "+639171234567",
  address: "Demo office",
  serviceAreas: "Albay",
  registrationNumber: "DEMO-001",
  supportContact: "help@example.test",
  services: ["SELF_DRIVE"],
  eligibilityTerms: "Valid license required",
  terms: "Agreed rental terms",
  cancellationPolicy: "Review before release",
  refundPolicy: "Refund after review",
  damagePolicy: "Inspect before and after",
  latePolicy: "Itemized charges only",
  dailyRateCentavos: 200000,
  depositCentavos: 0,
  holdHours: 24,
  bufferMinutes: 0,
  inclusions: "Rental only",
  exclusions: "Fuel and tolls",
  acceptedMethods: ["CASH"],
  consent: true,
};

beforeAll(async () => {
  if (process.env.NEON_PROJECT_ID !== "floral-flower-08375841")
    throw Error(
      "Integration tests require the designated new Rent2Go database.",
    );
  for (const a of [owner, other, admin])
    await db.query(
      "INSERT INTO app_actor(id,email,name,role) VALUES($1,$2,'Integration fixture',$3)",
      [a.id, `${a.id}@example.test`, a.role],
    );
});
afterAll(async () => {
  await db.end();
});
describe("transactional partner workflow on new Neon", () => {
  let id: string;
  it("creates an idempotent owner draft without granting agency privilege", async () => {
    const a = await createApplication(owner);
    id = a.id;
    expect((await createApplication(owner)).id).toBe(id);
    expect(
      (await db.query("SELECT role FROM app_actor WHERE id=$1", [owner.id]))
        .rows[0].role,
    ).toBe("RENTER");
  });
  it("denies another owner and rejects a forged role against stored actor permission", async () => {
    await expect(getApplication(other, id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      reviewApplication(
        { ...owner, role: "SUPER_ADMIN" },
        id,
        1,
        "APPROVE",
        "Should be forbidden",
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("serializes concurrent saves and rejects stale versions", async () => {
    const outcomes = await Promise.allSettled([
      saveDraft(owner, id, payload, 1),
      saveDraft(owner, id, { ...payload, businessName: "Other write" }, 1),
    ]);
    expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((x) => x.status === "rejected")).toHaveLength(1);
    await saveDraft(owner, id, payload, 2);
  });
  it("requires registration evidence before submission", async () => {
    await expect(submitApplication(owner, id, 3)).rejects.toThrow(
      /registration evidence/i,
    );
    await db.query(
      "INSERT INTO private_file(id,application_id,owner_id,purpose,object_key,original_name,mime,size_bytes,sha256) VALUES($1,$2,$3,'REGISTRATION',$4,'synthetic.pdf','application/pdf',10,'test')",
      [randomUUID(), id, owner.id, `fixture/${randomUUID()}`],
    );
    const a = await submitApplication(owner, id, 3);
    expect(a.status).toBe("SUBMITTED");
    expect(a.version).toBe(4);
  });
  it("preserves feedback and submitted evidence across correction/resubmission", async () => {
    await reviewApplication(
      admin,
      id,
      4,
      "CHANGES_REQUESTED",
      "Clarify the refund process.",
    );
    await saveDraft(
      owner,
      id,
      {
        ...payload,
        refundPolicy: "Refund request, review, then recorded payout.",
      },
      5,
    );
    await submitApplication(owner, id, 6);
    const a = await getApplication(owner, id);
    expect(a.revisions).toHaveLength(2);
    expect(a.reviews[0].reason).toContain("Clarify");
    expect(a.revisions[0].payload.refundPolicy).toBe(payload.refundPolicy);
  });
  it("approves once, creates agency and snapshots policy; duplicate and later edits fail", async () => {
    const outcomes = await Promise.allSettled([
      reviewApplication(
        admin,
        id,
        7,
        "APPROVE",
        "Requirements reviewed and accepted.",
      ),
      reviewApplication(
        admin,
        id,
        7,
        "APPROVE",
        "Requirements reviewed and accepted.",
      ),
    ]);
    expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await getApplication(owner, id)).status).toBe("APPROVED");
    const agency = (
      await db.query("SELECT * FROM agency WHERE application_id=$1", [id])
    ).rows[0];
    expect(agency.approved_revision).toBe(2);
    await expect(saveDraft(owner, id, payload, 8)).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      db.query(
        "UPDATE partner_revision SET payload='{}' WHERE application_id=$1",
        [id],
      ),
    ).rejects.toThrow(/immutable/i);
    expect(
      (
        await db.query(
          "SELECT count(*) FROM app_notification WHERE recipient_id=$1",
          [owner.id],
        )
      ).rows[0].count,
    ).toBe("2");
  });
  it("reviews changed policies without replacing the effective approved agreement prematurely", async () => {
    let app = await startPolicyRevision(owner, id, 8);
    expect(app.status).toBe("DRAFT");
    await saveDraft(
      owner,
      id,
      {
        ...payload,
        split: {
          cosigner: 6500,
          agency: 1500,
          platform: 1000,
          maintenance: 1000,
        },
      },
      app.version,
    );
    app = await submitApplication(owner, id, app.version + 1);
    let effective = (
      await db.query(
        "SELECT approved_revision,active FROM agency WHERE application_id=$1",
        [id],
      )
    ).rows[0];
    expect(effective.approved_revision).toBe(2);
    expect(effective.active).toBe(true);
    await reviewApplication(
      admin,
      id,
      app.version,
      "APPROVE",
      "Updated agreement shares accepted.",
    );
    effective = (
      await db.query(
        "SELECT approved_revision FROM agency WHERE application_id=$1",
        [id],
      )
    ).rows[0];
    expect(effective.approved_revision).toBe(3);
    expect(
      (await getApplication(owner, id)).revisions[1].payload.split.cosigner,
    ).toBe(7000);
  });
  it("lets an owner reopen a withdrawn first application without receiving agency access", async () => {
    const draft = await createApplication(other),
      withdrawn = await withdrawApplication(other, draft.id, draft.version);
    const reopened = await startPolicyRevision(
      other,
      draft.id,
      withdrawn.version,
    );
    expect(reopened.status).toBe("DRAFT");
    expect(reopened.payload.consent).toBe(false);
    expect(
      (await db.query("SELECT role FROM app_actor WHERE id=$1", [other.id]))
        .rows[0].role,
    ).toBe("RENTER");
  });
});
