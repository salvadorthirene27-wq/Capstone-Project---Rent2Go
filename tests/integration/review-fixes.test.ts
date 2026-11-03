import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import {
  createApplication,
  saveDraft,
  submitApplication,
  getApplication,
  applicationQueue,
} from "../../src/modules/partners/service";
import { defaultApplication } from "../../src/modules/partners/schema";
const owner = { id: randomUUID(), role: "RENTER" as const },
  admin = { id: randomUUID(), role: "SUPER_ADMIN" as const };
beforeAll(async () => {
  if (process.env.NEON_PROJECT_ID !== "floral-flower-08375841")
    throw Error("Wrong target");
  for (const a of [owner, admin])
    await db.query(
      "INSERT INTO app_actor(id,email,name,role) VALUES($1,$2,'Regression fixture',$3)",
      [a.id, `${a.id}@example.test`, a.role],
    );
});
afterAll(() => db.end());
it("snapshots only current evidence and returns historical revision-specific files", async () => {
  const app = await createApplication(owner);
  const p = {
    ...defaultApplication,
    businessName: "Replacement demo",
    legalName: "Replacement demo",
    representative: "Demo",
    email: "demo@example.test",
    phone: "+639171234567",
    address: "Demo",
    serviceAreas: "Albay",
    registrationNumber: "DEMO",
    supportContact: "help@example.test",
    services: ["SELF_DRIVE"],
    eligibilityTerms: "Valid license",
    terms: "Rental terms",
    cancellationPolicy: "Review cancellations",
    refundPolicy: "Review refunds",
    damagePolicy: "Inspect damages",
    latePolicy: "Review late fees",
    inclusions: "Car",
    exclusions: "Fuel",
    dailyRateCentavos: 100000,
    depositCentavos: 0,
    holdHours: 24,
    bufferMinutes: 0,
    acceptedMethods: ["CASH"],
    consent: true,
  };
  await saveDraft(owner, app.id, p, 1);
  const old = randomUUID(),
    current = randomUUID();
  for (const [id, selected] of [
    [old, false],
    [current, true],
  ] as const)
    await db.query(
      "INSERT INTO private_file(id,application_id,owner_id,purpose,object_key,original_name,mime,size_bytes,sha256,is_current) VALUES($1,$2,$3,'REGISTRATION',$4,$5,'application/pdf',10,'test',$6)",
      [
        id,
        app.id,
        owner.id,
        `fixture/${id}`,
        selected ? "current.pdf" : "superseded.pdf",
        selected,
      ],
    );
  await submitApplication(owner, app.id, 2);
  const detail = await getApplication(owner, app.id);
  expect(detail.files.map((f) => f.id)).toEqual([current]);
  expect(detail.revisions[0].files.map((f: { id: string }) => f.id)).toEqual([
    current,
  ]);
  expect(
    (
      await db.query(
        "SELECT count(*) FROM private_file WHERE application_id=$1",
        [app.id],
      )
    ).rows[0].count,
  ).toBe("2");
});
it("finds older pending work before pagination and provides complete counts", async () => {
  const prefix = `page-${randomUUID()}-`;
  await db.query(
    "INSERT INTO app_actor(id,email,name) SELECT $1||n, $1||n||'@example.test','Pagination fixture' FROM generate_series(1,105) n",
    [prefix],
  );
  await db.query(
    "INSERT INTO partner_application(id,owner_id,payload) SELECT gen_random_uuid(),id,$2 FROM app_actor WHERE id LIKE $1",
    [`${prefix}%`, JSON.stringify(defaultApplication)],
  );
  const old = randomUUID();
  await db.query(
    "INSERT INTO partner_application(id,owner_id,status,payload,updated_at) VALUES($1,$2,'SUBMITTED',$3,now()-interval '1 year')",
    [old, admin.id, JSON.stringify(defaultApplication)],
  );
  const queue = await applicationQueue(admin, { page: 1, pendingOnly: true });
  expect(queue.pendingCount).toBeGreaterThan(0);
  expect(queue.items.some((a) => a.id === old)).toBe(true);
  const page1 = await applicationQueue(admin, { page: 1, pendingOnly: false }),
    page2 = await applicationQueue(admin, { page: 2, pendingOnly: false });
  expect(page1.total).toBeGreaterThan(100);
  expect(page1.items).toHaveLength(25);
  expect(page2.items).toHaveLength(25);
  expect(page2.items.some((a) => page1.items.some((b) => b.id === a.id))).toBe(
    false,
  );
});
