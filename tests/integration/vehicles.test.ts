import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import {
  createApplication,
  saveDraft,
  submitApplication,
  reviewApplication,
  startPolicyRevision,
} from "../../src/modules/partners/service";
import { defaultApplication } from "../../src/modules/partners/schema";
import {
  createVehicleOffer,
  vehicleDetail,
  saveVehicleDraft,
  transitionVehicleOffer,
  publicVehicles,
  listVehicleOffers,
  authorizeVehicleUpload,
  attachVehicleFile,
  vehicleFileForRead,
  removeVehicleFile,
} from "../../src/modules/vehicles/service";
import type { Actor } from "../../src/modules/partners/workflow";
const owner: Actor = { id: randomUUID(), role: "RENTER" },
  operator: Actor = { id: randomUUID(), role: "RENTER" },
  other: Actor = { id: randomUUID(), role: "RENTER" },
  admin: Actor = { id: randomUUID(), role: "SUPER_ADMIN" };
const facts = {
  make: "Toyota",
  model: "Vios",
  year: 2024,
  seats: 5,
  transmission: "AUTOMATIC",
  fuel: "GASOLINE",
  bodyType: "SEDAN",
  description: "Synthetic compact car for workflow verification.",
  features: ["Air conditioning"],
  pickupInstructions: "Collection at the agreed agency office.",
};
let agencyId: string;
async function evidence(offer: any) {
  for (const purpose of offer.ownership === "CONSIGNED" ? ["OWNERSHIP", "DRIVER_LICENSE", "PHOTO"] : ["OWNERSHIP", "PHOTO"])
    await db.query(
      "INSERT INTO vehicle_file(id,vehicle_id,uploader_id,purpose,object_key,original_name,mime,size_bytes,sha256,backend) VALUES($1,$2,$3,$4,$5,'synthetic.png','image/png',10,'test','local')",
      [
        randomUUID(),
        offer.vehicleId,
        owner.id,
        purpose,
        `${offer.vehicleId}/${randomUUID()}`,
      ],
    );
}
async function personal() {
  return createVehicleOffer(owner, {
    ownership: "CONSIGNED",
    agencyId,
    registration: `TST${randomUUID().replaceAll("-", "").slice(0, 8)}`,
    facts,
  });
}
beforeAll(async () => {
  if (
    !process.env.TEST_DATABASE_URL ||
    process.env.NEON_PROJECT_ID !== "floral-flower-08375841"
  )
    throw Error("Use the isolated test database.");
  for (const a of [owner, operator, other, admin])
    await db.query(
      "INSERT INTO app_actor(id,email,name,role) VALUES($1,$2,'Synthetic vehicle tester',$3)",
      [a.id, `${a.id}@example.test`, a.role],
    );
  const app = await createApplication(operator),
    payload = {
      ...defaultApplication,
      businessName: "Vehicle workflow demo",
      legalName: "Synthetic company",
      representative: "Synthetic representative",
      email: "vehicle@example.test",
      phone: "+639171234567",
      address: "Demo office",
      serviceAreas: "Albay",
      registrationNumber: "DEMO-VEHICLE",
      supportContact: "help@example.test",
      services: ["SELF_DRIVE"],
      eligibilityTerms: "Identity and valid driving license.",
      terms: "Agreed quotation and agreement.",
      cancellationPolicy: "Review before release.",
      refundPolicy: "Reviewed separate refund.",
      damagePolicy: "Documented inspections.",
      latePolicy: "Itemized agreed charges.",
      inclusions: "Vehicle service",
      exclusions: "Fuel",
      dailyRateCentavos: 200000,
      depositCentavos: 300000,
      holdHours: 24,
      bufferMinutes: 30,
      acceptedMethods: ["CASH"],
      consent: true,
    };
  await saveDraft(operator, app.id, payload, 1);
  await db.query(
    "INSERT INTO private_file(id,application_id,owner_id,purpose,object_key,original_name,mime,size_bytes,sha256) VALUES($1,$2,$3,'REGISTRATION',$4,'synthetic.pdf','application/pdf',10,'test')",
    [randomUUID(), app.id, operator.id, `fixture/${randomUUID()}`],
  );
  await submitApplication(operator, app.id, 2);
  await reviewApplication(
    admin,
    app.id,
    3,
    "APPROVE",
    "Synthetic complete agency evidence reviewed.",
  );
  agencyId = (
    await db.query("SELECT id FROM agency WHERE application_id=$1", [app.id])
  ).rows[0].id;
}, 30000);
afterAll(() => db.end());
it("derives personal ownership from the actor and rejects forged owners or duplicate normalized plates", async () => {
  const offer = await personal();
  expect(offer.ownerId).toBe(owner.id);
  await expect(
    createVehicleOffer(other, {
      ownership: "CONSIGNED",
      agencyId,
      registration: "ZZZ1234",
      facts,
      ownerId: owner.id,
    }),
  ).rejects.toThrow();
  await expect(
    createVehicleOffer(other, {
      ownership: "CONSIGNED",
      agencyId,
      registration: offer.registration.toLowerCase(),
      facts,
    }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(vehicleDetail(other, offer.id)).rejects.toMatchObject({
    status: 404,
  });
  await expect(
    saveVehicleDraft(operator, offer.id, offer.version, {
      facts,
      terms: offer.terms,
    }),
  ).rejects.toMatchObject({ status: 403 });
});
it("requires active agency membership for agency-owned inventory even with a forged role", async () => {
  await expect(
    createVehicleOffer(
      { ...other, role: "AGENCY_ADMIN" },
      { ownership: "AGENCY_OWNED", agencyId, registration: "AGY1234", facts },
    ),
  ).rejects.toMatchObject({ status: 403 });
  const offer = await createVehicleOffer(operator, {
    ownership: "AGENCY_OWNED",
    agencyId,
    registration: `AGY${randomUUID().slice(0, 8)}`,
    facts,
  });
  expect(offer.ownerId).toBeNull();
  expect(offer.terms.shares.cosigner).toBe(0);
  expect(offer.terms.shares.agency).toBe(8000);
});
it("blocks a cosigner submission without the registration and driver's license", async () => {
  const offer = await personal();
  await expect(
    transitionVehicleOffer(owner, offer.id, {
      action: "SUBMIT",
      version: 1,
      revision: 0,
    }),
  ).rejects.toMatchObject({ status: 400 });
  expect((await vehicleDetail(owner, offer.id)).state).toBe("DRAFT");
});
it("preserves a signed revision through separate agency proposal, owner consent, compliance, publication and amendment", async () => {
  let offer = await personal();
  await evidence(offer);
  offer = await transitionVehicleOffer(owner, offer.id, {
    action: "SUBMIT",
    version: 1,
    revision: 0,
  });
  expect(offer.state).toBe("SUBMITTED");
  await expect(
    transitionVehicleOffer(other, offer.id, {
      action: "PROPOSE",
      version: offer.version,
      revision: offer.revision,
      terms: offer.terms,
    }),
  ).rejects.toMatchObject({ status: 403 });
  offer = await transitionVehicleOffer(operator, offer.id, {
    action: "PROPOSE",
    version: offer.version,
    revision: offer.revision,
    terms: {
      ...offer.terms,
      shares: {
        cosigner: 6500,
        agency: 1500,
        platform: 1000,
        maintenance: 1000,
      },
    },
  });
  expect(offer.state).toBe("AGREEMENT_PENDING");
  await expect(
    transitionVehicleOffer(operator, offer.id, {
      action: "ACCEPT",
      version: offer.version,
      revision: offer.revision,
    }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    transitionVehicleOffer(owner, offer.id, {
      action: "ACCEPT",
      version: offer.version,
      revision: offer.revision - 1,
    }),
  ).rejects.toMatchObject({ status: 409 });
  offer = await transitionVehicleOffer(owner, offer.id, {
    action: "ACCEPT",
    version: offer.version,
    revision: offer.revision,
  });
  await expect(
    transitionVehicleOffer(operator, offer.id, {
      action: "PUBLISH",
      version: offer.version,
      revision: offer.revision,
    }),
  ).rejects.toThrow();
  offer = await transitionVehicleOffer(admin, offer.id, {
    action: "APPROVE",
    version: offer.version,
    revision: offer.revision,
    reason:
      "Vehicle and ownership evidence reviewed for this synthetic scenario.",
  });
  expect(
    (await db.query("SELECT role FROM app_actor WHERE id=$1", [owner.id]))
      .rows[0].role,
  ).toBe("COSIGNER");
  offer = await transitionVehicleOffer(operator, offer.id, {
    action: "PUBLISH",
    version: offer.version,
    revision: offer.revision,
  });
  const pub = (await publicVehicles(offer.id)).find((v: any) => v.id === offer.id);
  expect(pub?.facts.model).toBe("Vios");
  expect(JSON.stringify(pub)).not.toContain(owner.id);
  expect(JSON.stringify(pub)).not.toContain(offer.registration);
  expect(JSON.stringify(pub)).not.toContain("shares");
  const detail = await vehicleDetail(owner, offer.id);
  expect(detail.agreements[0].revision).toBe(offer.revision);
  expect(detail.agreements[0].digest).toBe(
    detail.revisions.find((r: any) => r.revision === offer.revision).digest,
  );
  offer = await transitionVehicleOffer(owner, offer.id, {
    action: "UNPUBLISH",
    version: offer.version,
    revision: offer.revision,
    reason: "Prepare a corrected listing revision.",
  });
  expect((await publicVehicles(offer.id)).some((v: any) => v.id === offer.id)).toBe(
    false,
  );
  await expect(
    transitionVehicleOffer(operator, offer.id, {
      action: "PUBLISH",
      version: offer.version,
      revision: offer.revision,
    }),
  ).rejects.toMatchObject({ status: 403 });
  offer = await transitionVehicleOffer(owner, offer.id, {
    action: "AMEND",
    version: offer.version,
    revision: offer.revision,
  });
  expect(offer.approvedRevision).toBeNull();
  expect((await vehicleDetail(owner, offer.id)).agreements).toHaveLength(1);
}, 30000);
it("serializes duplicate submissions and retains a single immutable revision", async () => {
  const offer = await personal();
  await evidence(offer);
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      transitionVehicleOffer(owner, offer.id, {
        action: "SUBMIT",
        version: 1,
        revision: 0,
      }),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect((await vehicleDetail(owner, offer.id)).revisions).toHaveLength(1);
});

it("prevents a platform reviewer who operates the agency from approving its own inventory", async () => {
  const offer = await personal();
  await evidence(offer);
  let next = await transitionVehicleOffer(owner, offer.id, {
    action: "SUBMIT",
    version: 1,
    revision: 0,
  });
  next = await transitionVehicleOffer(operator, offer.id, {
    action: "PROPOSE",
    version: next.version,
    revision: next.revision,
    terms: next.terms,
  });
  next = await transitionVehicleOffer(owner, offer.id, {
    action: "ACCEPT",
    version: next.version,
    revision: next.revision,
  });
  await db.query(
    "INSERT INTO agency_member(agency_id,actor_id,role) VALUES($1,$2,'ADMIN')",
    [agencyId, admin.id],
  );
  try {
    await expect(
      transitionVehicleOffer(admin, offer.id, {
        action: "APPROVE",
        version: next.version,
        revision: next.revision,
        reason: "Conflicted reviewer must not approve.",
      }),
    ).rejects.toMatchObject({ status: 403 });
  } finally {
    await db.query(
      "UPDATE agency_member SET active=false WHERE agency_id=$1 AND actor_id=$2",
      [agencyId, admin.id],
    );
  }
});
it("enforces immutable historical revisions and agreements in PostgreSQL", async () => {
  let offer = await personal();
  await evidence(offer);
  offer = await transitionVehicleOffer(owner, offer.id, {
    action: "SUBMIT",
    version: 1,
    revision: 0,
  });
  offer = await transitionVehicleOffer(operator, offer.id, {
    action: "PROPOSE",
    version: offer.version,
    revision: offer.revision,
    terms: offer.terms,
  });
  offer = await transitionVehicleOffer(owner, offer.id, {
    action: "ACCEPT",
    version: offer.version,
    revision: offer.revision,
  });
  await expect(
    db.query("UPDATE vehicle_revision SET digest='changed' WHERE offer_id=$1", [
      offer.id,
    ]),
  ).rejects.toThrow("Historical records are immutable");
  await expect(
    db.query("DELETE FROM vehicle_agreement WHERE offer_id=$1", [offer.id]),
  ).rejects.toThrow("Historical records are immutable");
});

it("avoids an actor/offer lock cycle during approval and a concurrent owner retry", async () => {
  await db.query("UPDATE app_actor SET role='RENTER' WHERE id=$1", [owner.id]);
  let offer = await personal();
  await evidence(offer);
  offer = await transitionVehicleOffer(owner, offer.id, {
    action: "SUBMIT",
    version: 1,
    revision: 0,
  });
  offer = await transitionVehicleOffer(operator, offer.id, {
    action: "PROPOSE",
    version: offer.version,
    revision: offer.revision,
    terms: offer.terms,
  });
  const stale = {
    action: "ACCEPT",
    version: offer.version,
    revision: offer.revision,
  };
  offer = await transitionVehicleOffer(owner, offer.id, stale);
  const barrier = await db.connect();
  await barrier.query("BEGIN");
  await barrier.query("SELECT id FROM vehicle_offer WHERE id=$1 FOR UPDATE", [
    offer.id,
  ]);
  async function waitForWaiters(n: number) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const count = Number(
        (
          await db.query(
            "SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%FROM vehicle_offer o%' AND query LIKE '%FOR UPDATE OF o%'",
          )
        ).rows[0].n,
      );
      if (count >= n) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw Error("Expected lock waiter was not observed.");
  }
  let approval: Promise<any> | undefined, retry: Promise<any> | undefined;
  try {
    approval = transitionVehicleOffer(admin, offer.id, {
      action: "APPROVE",
      version: offer.version,
      revision: offer.revision,
      reason: "Independent synthetic compliance review.",
    });
    await waitForWaiters(1);
    retry = transitionVehicleOffer(owner, offer.id, stale);
    await waitForWaiters(2);
    await barrier.query("COMMIT");
  } finally {
    await barrier.query("ROLLBACK");
    barrier.release();
  }
  const results = await Promise.allSettled([approval!, retry!]);
  expect(results[0].status).toBe("fulfilled");
  expect(results[1].status).toBe("rejected");
  if (results[1].status === "rejected")
    expect(results[1].reason.status).toBe(409);
}, 30000);
it("discovers only authorized owned, agency and independent compliance queues", async () => {
  const offer = await personal();
  expect(
    (await listVehicleOffers(owner, { scope: "OWNED" })).items.some(
      (v) => v.id === offer.id,
    ),
  ).toBe(true);
  expect(
    (await listVehicleOffers(other, { scope: "OWNED" })).items.some(
      (v) => v.id === offer.id,
    ),
  ).toBe(false);
  await expect(
    listVehicleOffers(
      { ...other, role: "AGENCY_ADMIN" },
      { scope: "AGENCY", agencyId },
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    listVehicleOffers(
      { ...other, role: "SUPER_ADMIN" },
      { scope: "COMPLIANCE" },
    ),
  ).rejects.toMatchObject({ status: 403 });
  expect(
    (
      await listVehicleOffers(operator, { scope: "AGENCY", agencyId })
    ).items.some((v) => v.id === offer.id),
  ).toBe(false);
  await evidence(offer);
  await transitionVehicleOffer(owner, offer.id, {
    action: "SUBMIT",
    version: offer.version,
    revision: offer.revision,
  });
  expect(
    (
      await listVehicleOffers(operator, { scope: "AGENCY", agencyId })
    ).items.some((v) => v.id === offer.id),
  ).toBe(true);
});
it("binds upload metadata to the owning draft and exposes only approved published photo revisions", async () => {
  let o = await personal();
  const metadata = (purpose: "PHOTO" | "OWNERSHIP" | "DRIVER_LICENSE") => ({
    id: randomUUID(),
    purpose,
    name: "synthetic-evidence.png",
    mime: "image/png",
    size: 10,
    sha256: "0".repeat(64),
    backend: "local",
  });
  await expect(
    authorizeVehicleUpload(operator, o.id, o.version),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    authorizeVehicleUpload(other, o.id, o.version),
  ).rejects.toMatchObject({ status: 403 });
  const ownership = metadata("OWNERSHIP");
  let saved = await attachVehicleFile(owner, o.id, o.version, ownership);
  o.version = saved.version;
  const photo = metadata("PHOTO");
  saved = await attachVehicleFile(owner, o.id, o.version, photo);
  o.version = saved.version;
  await expect(transitionVehicleOffer(owner, o.id, {
    action: "SUBMIT", version: o.version, revision: o.revision,
  })).rejects.toThrow(/driver's license/);
  const license = metadata("DRIVER_LICENSE");
  o.version = (await attachVehicleFile(owner, o.id, o.version, license)).version;
  await expect(vehicleFileForRead(null, license.id)).rejects.toMatchObject({status:404});
  await expect(vehicleFileForRead(other, license.id)).rejects.toMatchObject({status:404});
  await expect(
    attachVehicleFile(owner, o.id, o.version - 1, metadata("PHOTO")),
  ).rejects.toMatchObject({ status: 409 });
  await expect(vehicleFileForRead(null, photo.id)).rejects.toMatchObject({
    status: 404,
  });
  await expect(vehicleFileForRead(other, ownership.id)).rejects.toMatchObject({
    status: 404,
  });
  expect((await vehicleFileForRead(owner, ownership.id)).objectKey).toBe(
    `${o.vehicleId}/${ownership.id}`,
  );
  o = await transitionVehicleOffer(owner, o.id, {
    action: "SUBMIT",
    version: o.version,
    revision: o.revision,
  });
  await expect(
    authorizeVehicleUpload(owner, o.id, o.version),
  ).rejects.toMatchObject({ status: 409 });
  expect((await vehicleFileForRead(operator, ownership.id)).mime).toBe(
    "image/png",
  );
  o = await transitionVehicleOffer(operator, o.id, {
    action: "PROPOSE",
    version: o.version,
    revision: o.revision,
    terms: o.terms,
  });
  o = await transitionVehicleOffer(owner, o.id, {
    action: "ACCEPT",
    version: o.version,
    revision: o.revision,
  });
  o = await transitionVehicleOffer(admin, o.id, {
    action: "APPROVE",
    version: o.version,
    revision: o.revision,
    reason: "Synthetic vehicle evidence reviewed.",
  });
  o = await transitionVehicleOffer(operator, o.id, {
    action: "PUBLISH",
    version: o.version,
    revision: o.revision,
  });
  expect((await vehicleFileForRead(null, photo.id)).public).toBe(true);
  await expect(vehicleFileForRead(null, ownership.id)).rejects.toMatchObject({
    status: 404,
  });
  o = await transitionVehicleOffer(owner, o.id, {
    action: "UNPUBLISH",
    version: o.version,
    revision: o.revision,
    reason: "Withdraw the car from new requests.",
  });
  await expect(vehicleFileForRead(null, photo.id)).rejects.toMatchObject({
    status: 404,
  });
  o = await transitionVehicleOffer(owner, o.id, {
    action: "AMEND",
    version: o.version,
    revision: o.revision,
  });
  const removed = await removeVehicleFile(owner, o.id, o.version, photo.id);
  o.version = removed.version;
  expect(
    (await vehicleDetail(owner, o.id)).files.find((f) => f.id === photo.id)
      ?.is_current,
  ).toBe(false);
  expect((await vehicleDetail(owner, o.id)).revisions.length).toBe(2);
}, 30000);
it("keeps personal draft evidence private and shares corrected content only after resubmission", async () => {
  let o = await personal();
  const file = (purpose: "PHOTO" | "OWNERSHIP" | "DRIVER_LICENSE") => ({
    id: randomUUID(),
    purpose,
    name: "private-draft.png",
    mime: "image/png",
    size: 10,
    sha256: "1".repeat(64),
    backend: "local",
  });
  const first = file("OWNERSHIP");
  o.version = (await attachVehicleFile(owner, o.id, o.version, first)).version;
  const photo = file("PHOTO");
  o.version = (await attachVehicleFile(owner, o.id, o.version, photo)).version;
  o.version = (await attachVehicleFile(owner, o.id, o.version, file("DRIVER_LICENSE"))).version;
  await expect(vehicleDetail(operator, o.id)).rejects.toMatchObject({
    status: 404,
  });
  await expect(vehicleFileForRead(operator, first.id)).rejects.toMatchObject({
    status: 404,
  });
  expect(
    (
      await listVehicleOffers(operator, { scope: "AGENCY", agencyId })
    ).items.some((v) => v.id === o.id),
  ).toBe(false);
  o = await transitionVehicleOffer(owner, o.id, {
    action: "SUBMIT",
    version: o.version,
    revision: o.revision,
  });
  o = await transitionVehicleOffer(operator, o.id, {
    action: "REQUEST_CHANGES",
    version: o.version,
    revision: o.revision,
    reason: "Please replace the unreadable ownership evidence.",
  });
  o = await saveVehicleDraft(owner, o.id, o.version, {
    facts: { ...facts, model: "Confidential Draft Model", description: "PRIVATE UNSUBMITTED CORRECTION" },
    terms: o.terms,
  });
  const replacement = file("OWNERSHIP");
  o.version = (
    await attachVehicleFile(owner, o.id, o.version, replacement)
  ).version;
  const agencyView = await vehicleDetail(operator, o.id);
  expect(agencyView.facts.description).toBe(facts.description);
  const filters = { pending: "1", make: facts.make, year: facts.year, bodyType: facts.bodyType, transmission: facts.transmission, billingUnit: o.terms.billingUnit, minRate: o.terms.rateCentavos, maxRate: o.terms.rateCentavos };
  const matching = await listVehicleOffers(operator, { scope: "AGENCY", agencyId, filters: { ...filters, model: facts.model } });
  expect(matching.items.find(item => item.id === o.id)?.availability).toBe("UNAVAILABLE");
  const hidden = await listVehicleOffers(operator, { scope: "AGENCY", agencyId, filters: { ...filters, model: "Confidential Draft Model" } });
  expect(hidden.total).toBe(0);
  expect(agencyView.files.some((f) => f.id === replacement.id)).toBe(false);
  expect(agencyView.files.some((f) => f.id === first.id && f.is_current)).toBe(
    true,
  );
  await expect(
    vehicleFileForRead(operator, replacement.id),
  ).rejects.toMatchObject({ status: 404 });
  expect((await vehicleFileForRead(operator, first.id)).mime).toBe("image/png");
  const agencyWithdrawal = await transitionVehicleOffer(operator, o.id, {
    action: "UNPUBLISH",
    version: o.version,
    revision: o.revision,
    reason: "Agency stops its review of this offer.",
  });
  expect(JSON.stringify(agencyWithdrawal)).not.toContain(
    "PRIVATE UNSUBMITTED CORRECTION",
  );
  o = await transitionVehicleOffer(owner, o.id, {
    action: "AMEND",
    version: agencyWithdrawal.version,
    revision: agencyWithdrawal.revision,
  });
  o = await transitionVehicleOffer(owner, o.id, {
    action: "SUBMIT",
    version: o.version,
    revision: o.revision,
  });
  expect((await vehicleDetail(operator, o.id)).facts.description).toBe(
    "PRIVATE UNSUBMITTED CORRECTION",
  );
  expect((await vehicleFileForRead(operator, replacement.id)).mime).toBe(
    "image/png",
  );
}, 30000);
it("withdraws vehicle modes that the effective approved agency policy no longer permits", async () => {
  async function approvedOffer() {
    let o = await personal();
    await evidence(o);
    o = await transitionVehicleOffer(owner, o.id, {
      action: "SUBMIT",
      version: 1,
      revision: 0,
    });
    o = await transitionVehicleOffer(operator, o.id, {
      action: "PROPOSE",
      version: o.version,
      revision: o.revision,
      terms: o.terms,
    });
    o = await transitionVehicleOffer(owner, o.id, {
      action: "ACCEPT",
      version: o.version,
      revision: o.revision,
    });
    return transitionVehicleOffer(admin, o.id, {
      action: "APPROVE",
      version: o.version,
      revision: o.revision,
      reason: "Synthetic evidence reviewed independently.",
    });
  }
  let published = await approvedOffer();
  const approved = await approvedOffer();
  published = await transitionVehicleOffer(operator, published.id, {
    action: "PUBLISH",
    version: published.version,
    revision: published.revision,
  });
  const app = (
    await db.query(
      "SELECT p.id,p.version FROM partner_application p JOIN agency a ON a.application_id=p.id WHERE a.id=$1",
      [agencyId],
    )
  ).rows[0];
  let policy = await startPolicyRevision(operator, app.id, app.version);
  policy = await saveDraft(
    operator,
    app.id,
    {
      ...policy.payload,
      services: ["GROUP_TOUR"],
      perPersonCentavos: 150000,
      consent: true,
    },
    policy.version,
  );
  policy = await submitApplication(operator, app.id, policy.version);
  await reviewApplication(
    admin,
    app.id,
    policy.version,
    "APPROVE",
    "Agency now offers tours only; rentals removed.",
  );
  expect((await publicVehicles(published.id)).some((v) => v.id === published.id)).toBe(
    false,
  );
  await expect(
    transitionVehicleOffer(operator, approved.id, {
      action: "PUBLISH",
      version: approved.version,
      revision: approved.revision,
    }),
  ).rejects.toMatchObject({ status: 400 });
  published = await transitionVehicleOffer(owner, published.id, {
    action: "UNPUBLISH",
    version: published.version,
    revision: published.revision,
    reason: "Rental service is no longer enabled.",
  });
  expect(published.state).toBe("WITHDRAWN");
}, 60000); // Two complete consignment approvals plus a reviewed policy revision use many real network transactions.
