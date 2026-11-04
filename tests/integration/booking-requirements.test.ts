import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import { approvedAgency } from "../helpers/agency";
import type { Actor } from "../../src/modules/partners/workflow";
import { getRequirements, changeRequirements, authorizeRequirementUpload, attachRequirementFile, bookingFileForRead } from "../../src/modules/bookings/requirements";
const reviewer: Actor = {
  id: randomUUID(), role: "RENTER"
}, renter: Actor = {
  id: randomUUID(), role: "RENTER"
}, other: Actor = {
  id: randomUUID(), role: "RENTER"
}, admin: Actor = {
  id: randomUUID(), role: "SUPER_ADMIN"
};
let agency: string;
async function request(selfDrive = false) {
  const id = randomUUID(), cart = randomUUID(), item = randomUUID();
  await db.query("INSERT INTO booking_request(id,agency_id,renter_id,agency_name,contact) VALUES($1,$2,$3,$4,$5)", [id, agency, renter.id, "Synthetic requirements agency", {}]);
  await db.query("INSERT INTO booking_cart(id,owner_id) VALUES($1,$2) ON CONFLICT(owner_id) DO NOTHING", [cart, renter.id]);
  const existing = (await db.query("SELECT id FROM booking_cart WHERE owner_id=$1", [renter.id])).rows[0].id;
  await db.query("INSERT INTO cart_item(id,cart_id,kind,selection,saved_quote,fingerprint) VALUES($1,$2,'RENTAL','{}','{}',$3)", [item, existing, randomUUID()]);
  await db.query("INSERT INTO booking_request_line(id,request_id,agency_id,cart_item_id,public_quote,service_snapshot,policy_snapshot,private_financial_snapshot) VALUES($1,$2,$3,$4,$5,'{}','{}','{}')", [randomUUID(), id, agency, item, {
    selection: {
      kind: "RENTAL", mode: selfDrive ? "SELF_DRIVE" : "WITH_DRIVER"
    }, endAt: "2031-09-01T20:00:00Z"
  }]);
  return id;
}
async function upload(id: string, version: number, purpose: "IDENTITY" | "DRIVER_LICENSE" = "IDENTITY", expiresOn: string | null = null) {
  return attachRequirementFile(renter, id, version, {
    id: randomUUID(), purpose, name: "synthetic.pdf", mime: "application/pdf", size: 10, sha256: "0".repeat(64), backend: "local", expiresOn
  });
}
beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL || process.env.NEON_PROJECT_ID !== "floral-flower-08375841")
    throw Error("Use isolated test DB.");
  for (const a of [reviewer, renter, other, admin])
    await db.query("INSERT INTO app_actor(id,email,name,role) VALUES($1,$2,'Synthetic requirements actor',$3)", [a.id, `${a.id}@example.test`, a.role]);
  agency = await approvedAgency(reviewer, admin);
}, 120000);
afterAll(() => db.end());
it("enforces private ownership, agency membership, stale versions and self review", async () => {
  const id = await request();
  for (const actor of [other, admin]) {
    await expect(getRequirements(actor, id)).rejects.toMatchObject({
      status: 404
    });
    await expect(authorizeRequirementUpload(actor, id, 1)).rejects.toMatchObject({
      status: 404
    });
  }
  await expect(changeRequirements(renter, id, {
    action: "SUBMIT", version: 1
  })).rejects.toThrow("every required");
  const s = await upload(id, 1);
  await expect(upload(id, 1)).rejects.toMatchObject({
    status: 409
  });
  await expect(bookingFileForRead(reviewer, s.documents[0].id)).rejects.toMatchObject({
    status: 404
  });
  await expect(bookingFileForRead(admin, s.documents[0].id)).rejects.toMatchObject({
    status: 404
  });
  expect((await bookingFileForRead(renter, s.documents[0].id)).objectKey).toContain(id);
  const submitted = await changeRequirements(renter, id, {
    action: "SUBMIT", version: s.requestVersion
  });
  await db.query("INSERT INTO agency_member(agency_id,actor_id,role) VALUES($1,$2,'ADMIN')", [agency, renter.id]);
  await expect(changeRequirements(renter, id, {
    action: "START_REVIEW", version: submitted.requestVersion
  })).rejects.toMatchObject({
    status: 403
  });
  await expect(upload(id, submitted.requestVersion)).rejects.toMatchObject({
    status: 409
  });
  await db.query("UPDATE agency_member SET active=false WHERE agency_id=$1 AND actor_id=$2", [agency, reviewer.id]);
  await expect(getRequirements(reviewer, id)).rejects.toMatchObject({
    status: 404
  });
  await db.query("UPDATE agency_member SET active=true WHERE agency_id=$1 AND actor_id=$2", [agency, reviewer.id]);
});
it("preserves submitted snapshots and corrections through resubmission and final approval", async () => {
  const id = await request();
  let s = await upload(id, 1);
  const old = s.documents[0].id;
  s = await changeRequirements(renter, id, {
    action: "SUBMIT", version: s.requestVersion
  });
  await expect(changeRequirements(reviewer, id, {
    action: "COMPLETE_REVIEW", version: s.requestVersion
  })).rejects.toThrow("every required");
  s = await changeRequirements(reviewer, id, {
    action: "REVIEW_DOCUMENT", version: s.requestVersion, fileId: old, decision: "CHANGES_REQUESTED", reason: "Upload a legible identity."
  });
  s = await changeRequirements(reviewer, id, {
    action: "COMPLETE_REVIEW", version: s.requestVersion
  });
  expect(s.status).toBe("CHANGES_REQUESTED");
  expect((await getRequirements(renter, id)).documents[0].reason).toBe("Upload a legible identity.");
  s = await upload(id, s.requestVersion);
  expect(s.documents[0].status).toBe("PENDING");
  expect((await getRequirements(reviewer, id)).documents[0].id).toBe(old);
  await expect(bookingFileForRead(reviewer, s.documents[0].id)).rejects.toMatchObject({
    status: 404
  });
  s = await changeRequirements(renter, id, {
    action: "SUBMIT", version: s.requestVersion
  });
  s = await changeRequirements(reviewer, id, {
    action: "REVIEW_DOCUMENT", version: s.requestVersion, fileId: s.documents[0].id, decision: "ACCEPTED"
  });
  s = await changeRequirements(reviewer, id, {
    action: "COMPLETE_REVIEW", version: s.requestVersion
  });
  expect(s.status).toBe("READY_FOR_APPROVAL");
  expect(s.canEdit).toBe(false);
  expect((await db.query("SELECT count(*) FROM booking_requirement_submission WHERE request_id=$1", [id])).rows[0].count).toBe("2");
  await expect(db.query("DELETE FROM booking_requirement_file WHERE id=$1", [old])).rejects.toThrow();
});
it("requires human verification of license expiry through Manila service end and supports rejection", async () => {
  const id = await request(true);
  let s = await upload(id, 1);
  s = await upload(id, s.requestVersion, "DRIVER_LICENSE", "2031-09-01");
  s = await changeRequirements(renter, id, {
    action: "SUBMIT", version: s.requestVersion
  });
  const license = s.documents.find(d => d.purpose === "DRIVER_LICENSE")!;
  await expect(changeRequirements(reviewer, id, {
    action: "REVIEW_DOCUMENT", version: s.requestVersion, fileId: license.id, decision: "ACCEPTED"
  })).rejects.toThrow("expires before");
  s = await changeRequirements(reviewer, id, {
    action: "REJECT", version: s.requestVersion, reason: "Eligibility could not be established."
  });
  expect(s.status).toBe("REJECTED");
  await expect(upload(id, s.requestVersion)).rejects.toMatchObject({
    status: 409
  });
  expect((await db.query("SELECT message FROM booking_event WHERE request_id=$1 AND action=$2", [id, "REJECT"])).rows[0].message).toBe("Eligibility could not be established.");
});
it("grants the runtime role append-only access to all requirements records", async () => {
  for (const table of ["booking_requirement_file", "booking_requirement_submission", "booking_requirement_selection", "booking_requirement_decision"]) {
    const r = (await db.query("SELECT has_table_privilege('rent2go_app',$1,'SELECT') AS read,has_table_privilege('rent2go_app',$1,'INSERT') AS append,has_table_privilege('rent2go_app',$1,'UPDATE') AS update,has_table_privilege('rent2go_app',$1,'DELETE') AS delete", [table])).rows[0];
    expect(r).toEqual({
      read: true, append: true, update: false, delete: false
    });
  }
});
it('requires license presence and expiry and bounds upload totals', async () => {
  const id = await request(true);
  let s = await upload(id, 1);
  await expect(changeRequirements(renter, id, { action: 'SUBMIT', version: s.requestVersion })).rejects.toThrow('every required');
  s = await upload(id, s.requestVersion, 'DRIVER_LICENSE');
  s = await changeRequirements(renter, id, { action: 'SUBMIT', version: s.requestVersion });
  const f = s.documents.find(d => d.purpose === 'DRIVER_LICENSE')!;
  await expect(changeRequirements(reviewer, id, { action: 'REVIEW_DOCUMENT', version: s.requestVersion, fileId: f.id, decision: 'ACCEPTED' })).rejects.toThrow('expiry');
  await expect(bookingFileForRead(other, f.id)).rejects.toMatchObject({ status: 404 });
  const capped = await request();
  for (let i = 0;i < 30;i++) await db.query("INSERT INTO booking_requirement_file(id,request_id,uploader_id,purpose,name,mime,size,sha256,backend) VALUES($1,$2,$3,'IDENTITY','synthetic.pdf','application/pdf',10,'test','local')", [randomUUID(), capped, renter.id]);
  await expect(authorizeRequirementUpload(renter, capped, 1)).rejects.toThrow('30 document');
});
it('preserves uploaded expiry calendar dates and accepts coverage of the Manila service end', async () => {
  const id = await request(true);
  let s = await upload(id, 1, 'IDENTITY', '2031-09-02');
  s = await upload(id, s.requestVersion, 'DRIVER_LICENSE', '2031-09-02');
  expect(s.documents.map(d => d.expiresOn)).toEqual(['2031-09-02', '2031-09-02']);
  s = await changeRequirements(renter, id, { action: 'SUBMIT', version: s.requestVersion });
  for (const document of s.documents) s = await changeRequirements(reviewer, id, { action: 'REVIEW_DOCUMENT', version: s.requestVersion, fileId: document.id, decision: 'ACCEPTED' });
  s = await changeRequirements(reviewer, id, { action: 'COMPLETE_REVIEW', version: s.requestVersion });
  expect(s.status).toBe('READY_FOR_APPROVAL');
  expect(s.documents.every(d => d.expiresOn === '2031-09-02')).toBe(true);
});
