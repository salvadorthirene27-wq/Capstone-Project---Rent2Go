import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import {
  startPolicyRevision,
  saveDraft,
  submitApplication,
  reviewApplication,
} from "../../src/modules/partners/service";
import { approvedAgency } from "../helpers/agency";
import {
  createVehicleOffer,
  transitionVehicleOffer,
} from "../../src/modules/vehicles/service";
import {
  createDriver,
  updateDriver,
  resourceDetail,
  listResources,
  createBlock,
  cancelBlock,
  completeMaintenance,
  resourceAvailability,
} from "../../src/modules/resources/service";
import { DomainError, type Actor } from "../../src/modules/partners/workflow";
const operator: Actor = { id: randomUUID(), role: "RENTER" },
  owner: Actor = { id: randomUUID(), role: "RENTER" },
  other: Actor = { id: randomUUID(), role: "RENTER" },
  admin: Actor = { id: randomUUID(), role: "SUPER_ADMIN" };
let agencyId: string, resourceId: string;
const facts = {
  make: "Demo",
  model: "Calendar Car",
  year: 2024,
  seats: 5,
  transmission: "AUTOMATIC",
  fuel: "GASOLINE",
  bodyType: "SEDAN",
  description: "Synthetic resource calendar car.",
  features: [],
  pickupInstructions: "Synthetic office.",
};
const period = (day: number) => ({
  startAt: `2031-01-${String(day).padStart(2, "0")}T08:00:00+08:00`,
  endAt: `2031-01-${String(day).padStart(2, "0")}T12:00:00+08:00`,
});
beforeAll(async () => {
  if (
    !process.env.TEST_DATABASE_URL ||
    process.env.NEON_PROJECT_ID !== "floral-flower-08375841"
  )
    throw Error("Use isolated test DB.");
  for (const a of [operator, owner, other, admin])
    await db.query(
      "INSERT INTO app_actor(id,email,name,role) VALUES($1,$2,'Synthetic resource tester',$3)",
      [a.id, `${a.id}@example.test`, a.role],
    );
  agencyId = await approvedAgency(operator, admin);
  const vehicle = await createVehicleOffer(operator, {
    ownership: "AGENCY_OWNED",
    agencyId,
    registration: `RS${randomUUID().replaceAll("-", "").slice(0, 9)}`,
    facts,
  });
  resourceId = vehicle.vehicleId;
}, 30000);
afterAll(() => db.end());
it("creates one global vehicle resource and enforces operational scope", async () => {
  expect((await resourceDetail(operator, resourceId)).id).toBe(resourceId);
  await expect(resourceDetail(other, resourceId)).rejects.toMatchObject({
    status: 404,
  });
  await expect(resourceDetail(admin, resourceId)).rejects.toMatchObject({
    status: 404,
  });
  expect(
    (await listResources(operator, { scope: "AGENCY", agencyId })).items.some(
      (r) => r.id === resourceId,
    ),
  ).toBe(true);
});
it("keeps unsubmitted personal resource details private from a selected agency", async () => {
  const vehicle = await createVehicleOffer(owner, {
    ownership: "CONSIGNED",
    agencyId,
    registration: `PS${randomUUID().replaceAll("-", "").slice(0, 9)}`,
    facts,
  });
  expect((await resourceDetail(owner, vehicle.vehicleId)).kind).toBe("VEHICLE");
  await expect(
    resourceDetail(operator, vehicle.vehicleId),
  ).rejects.toMatchObject({ status: 404 });
  expect(
    (await listResources(operator, { scope: "AGENCY", agencyId })).items.some(
      (r) => r.id === vehicle.vehicleId,
    ),
  ).toBe(false);
});
it("serializes overlapping occupations while accepting adjacent half-open intervals", async () => {
  const data = {
    ...period(1),
    kind: "UNAVAILABLE",
    note: "Synthetic vehicle unavailable period.",
  };
  const results = await Promise.allSettled(
    [1, 2].map(() => createBlock(operator, resourceId, data)),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const rejected = results.find((r) => r.status === "rejected");
  if (rejected?.status === "rejected") expect(rejected.reason.status).toBe(409);
  await expect(
    createBlock(operator, resourceId, {
      ...data,
      startAt: "2031-01-01T12:00:00+08:00",
      endAt: "2031-01-01T14:00:00+08:00",
    }),
  ).resolves.toBeTruthy();
  const available = await resourceAvailability(operator, resourceId, period(1));
  expect(available.free).toBe(false);
  expect(available.bookable).toBe(false);
}, 30000);
it("rejects invalid ranges, foreign mutations and forged booking claims", async () => {
  await expect(
    createBlock(other, resourceId, {
      ...period(2),
      kind: "UNAVAILABLE",
      note: "Foreign access attempt.",
    }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    createBlock(operator, resourceId, {
      ...period(2),
      endAt: period(2).startAt,
      kind: "UNAVAILABLE",
      note: "Empty range rejected.",
    }),
  ).rejects.toThrow();
  await expect(
    createBlock(operator, resourceId, {
      ...period(2),
      kind: "BOOKING",
      note: "Forged booking must be rejected.",
    }),
  ).rejects.toThrow();
});
it("cancels only an authorized manual claim and preserves its history", async () => {
  const block = await createBlock(operator, resourceId, {
    ...period(3),
    kind: "UNAVAILABLE",
    note: "Synthetic scheduled unavailability.",
  });
  await expect(
    cancelBlock(other, block.id, "Unauthorized cancellation."),
  ).rejects.toMatchObject({ status: 404 });
  await cancelBlock(
    operator,
    block.id,
    "The synthetic block is no longer needed.",
  );
  expect(
    (await resourceAvailability(operator, resourceId, period(3))).free,
  ).toBe(true);
  expect(
    (await resourceDetail(operator, resourceId)).occupations.some(
      (o) => o.id === block.id && o.cancelled_at,
    ),
  ).toBe(true);
});
it("records maintenance completion and costs separately from financial payouts", async () => {
  const block = await createBlock(operator, resourceId, {
    ...period(4),
    kind: "MAINTENANCE",
    note: "Synthetic scheduled service inspection.",
  });
  await expect(
    completeMaintenance(
      other,
      block.id,
      1,
      250000,
      "Foreign maintenance attempt.",
    ),
  ).rejects.toMatchObject({ status: 404 });
  const result = await completeMaintenance(
    operator,
    block.id,
    1,
    250000,
    "Synthetic service completed; remaining block released.",
  );
  expect(result.costCentavos).toBe(250000);
  expect(
    (await resourceAvailability(operator, resourceId, period(4))).free,
  ).toBe(true);
  await expect(
    completeMaintenance(
      operator,
      block.id,
      1,
      1,
      "Duplicate completion blocked.",
    ),
  ).rejects.toMatchObject({ status: 409 });
});
it("keeps driver identity private to active operators and checks license validity", async () => {
  await expect(
    createDriver(other, {
      agencyId,
      name: "Synthetic driver",
      phone: "+639171234567",
      licenseNumber: "DEMO-LICENSE",
      licenseExpiry: "2099-12-31",
    }),
  ).rejects.toMatchObject({ status: 403 });
  const license = `DEMO-${randomUUID().slice(0, 8)}`;
  const driver = await createDriver(operator, {
    agencyId,
    name: "Synthetic driver",
    phone: "+639171234567",
    licenseNumber: license,
    licenseExpiry: "2099-12-31",
  });
  expect(
    (await resourceDetail(operator, driver.id)).driver?.licenseNumber,
  ).toBe(license);
  await expect(resourceDetail(owner, driver.id)).rejects.toMatchObject({
    status: 404,
  });
  await updateDriver(operator, driver.id, 1, { active: false });
  expect(
    (await resourceAvailability(operator, driver.id, period(5))).bookable,
  ).toBe(false);
  await expect(
    updateDriver(operator, driver.id, 1, { active: true }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    createDriver(operator, {
      agencyId,
      name: "Expired driver",
      phone: "+639171234567",
      licenseNumber: "EXPIRED",
      licenseExpiry: "2001-01-01",
    }),
  ).rejects.toThrow();
});
it("the database excludes overlaps independently of service validation", async () => {
  const first = await createBlock(operator, resourceId, {
    ...period(6),
    kind: "UNAVAILABLE",
    note: "Synthetic database constraint baseline.",
  });
  await expect(
    db.query(
      "INSERT INTO resource_occupation(id,resource_id,kind,start_at,end_at,note,created_by) SELECT $1,resource_id,'BOOKING',start_at,end_at,'Synthetic direct overlap',created_by FROM resource_occupation WHERE id=$2",
      [randomUUID(), first.id],
    ),
  ).rejects.toMatchObject({ code: "23P01" });
});

it("requires driver credentials to remain current through the requested service window", async () => {
  const d = await createDriver(operator, {
    agencyId,
    name: "Future-expiry driver",
    phone: "+639171234567",
    licenseNumber: `EXP-${randomUUID().slice(0, 8)}`,
    licenseExpiry: "2030-12-31",
  });
  expect((await resourceAvailability(operator, d.id, period(7))).bookable).toBe(
    false,
  );
});
it("prevents the same physical driver from being independently allocated through duplicate license identities", async () => {
  const license = `DRV-${randomUUID().slice(0, 8)}`;
  await createDriver(operator, {
    agencyId,
    name: "Unique synthetic driver",
    phone: "+639171234567",
    licenseNumber: license,
    licenseExpiry: "2099-12-31",
  });
  await expect(
    createDriver(operator, {
      agencyId,
      name: "Duplicate synthetic driver",
      phone: "+639171234567",
      licenseNumber: license.toLowerCase(),
      licenseExpiry: "2099-12-31",
    }),
  ).rejects.toMatchObject({ status: 409 });
  const otherAgency = await approvedAgency(other, admin);
  await expect(
    createDriver(other, {
      agencyId: otherAgency,
      name: "Duplicate across agencies",
      phone: "+639171234567",
      licenseNumber: license.replaceAll("-", ""),
      licenseExpiry: "2099-12-31",
    }),
  ).rejects.toMatchObject({ status: 409 });
}, 30000);

it("requires existing booking assignments to be resolved before invalidating a driver", async () => {
  const d = await createDriver(operator, {
    agencyId,
    name: "Assigned synthetic driver",
    phone: "+639171234567",
    licenseNumber: `BOOK-${randomUUID().slice(0, 8)}`,
    licenseExpiry: "2099-12-31",
  });
  const claim = randomUUID();
  await db.query(
    "INSERT INTO resource_occupation(id,resource_id,kind,start_at,end_at,note,created_by) VALUES($1,$2,'BOOKING',$3,$4,'Synthetic booking assignment',$5)",
    [claim, d.id, period(9).startAt, period(9).endAt, operator.id],
  );
  await expect(
    cancelBlock(
      operator,
      claim,
      "Manual cancellation must not override booking.",
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    updateDriver(operator, d.id, 1, { active: false }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    updateDriver(operator, d.id, 1, { licenseExpiry: "2030-12-31" }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    updateDriver(operator, d.id, 1, {
      licenseNumber: `CHANGED-${randomUUID().slice(0, 8)}`,
    }),
  ).rejects.toMatchObject({ status: 409 });
});

it("preserves an inactive driver's status when only contact details change", async () => {
  const d = await createDriver(operator, {
    agencyId,
    name: "Inactive synthetic driver",
    phone: "+639171234567",
    licenseNumber: `INACT-${randomUUID().slice(0, 8)}`,
    licenseExpiry: "2099-12-31",
    active: false,
  });
  await updateDriver(operator, d.id, 1, { phone: "+639171234568" });
  expect((await resourceDetail(operator, d.id)).driver?.active).toBe(false);
});

it("does not let an agency release an owner's unavailability or an owner complete agency maintenance", async () => {
  const v = await createVehicleOffer(owner, {
    ownership: "CONSIGNED",
    agencyId,
    registration: `OB${randomUUID().replaceAll("-", "").slice(0, 9)}`,
    facts,
  });
  for (const purpose of ["OWNERSHIP", "DRIVER_LICENSE", "PHOTO"])
    await db.query(
      "INSERT INTO vehicle_file(id,vehicle_id,uploader_id,purpose,object_key,original_name,mime,size_bytes,sha256,backend) VALUES($1,$2,$3,$4,$5,'synthetic.png','image/png',10,'test','local')",
      [
        randomUUID(),
        v.vehicleId,
        owner.id,
        purpose,
        `${v.vehicleId}/${randomUUID()}`,
      ],
    );
  await transitionVehicleOffer(owner, v.id, {
    action: "SUBMIT",
    version: 1,
    revision: 0,
  });
  const ownerBlock = await createBlock(owner, v.vehicleId, {
    ...period(10),
    kind: "UNAVAILABLE",
    note: "The personal owner needs this car.",
  });
  await expect(
    cancelBlock(
      operator,
      ownerBlock.id,
      "Agency cannot override owner unavailability.",
    ),
  ).rejects.toMatchObject({ status: 403 });
  await cancelBlock(
    owner,
    ownerBlock.id,
    "Owner releases their unavailability.",
  );
  const maintenance = await createBlock(operator, v.vehicleId, {
    ...period(11),
    kind: "MAINTENANCE",
    note: "Agency scheduled actual maintenance.",
  });
  await expect(
    completeMaintenance(
      owner,
      maintenance.id,
      1,
      0,
      "Owner cannot declare agency service completed.",
    ),
  ).rejects.toMatchObject({ status: 403 });
  await completeMaintenance(
    operator,
    maintenance.id,
    1,
    0,
    "Agency completed its synthetic service record.",
  );
}, 30000);

it("masks booking cancellation details from personal owners without agency access", async () => {
  const v = await createVehicleOffer(owner, {
    ownership: "CONSIGNED",
    agencyId,
    registration: `PR${randomUUID().replaceAll("-", "").slice(0, 9)}`,
    facts,
  });
  await db.query(
    "INSERT INTO resource_occupation(id,resource_id,kind,start_at,end_at,note,created_by,cancelled_at,cancellation_reason) VALUES($1,$2,'BOOKING',$3,$4,'PRIVATE RENTER NOTE',$5,now(),'PRIVATE RENTER CANCELLATION CONTACT')",
    [
      randomUUID(),
      v.vehicleId,
      period(12).startAt,
      period(12).endAt,
      operator.id,
    ],
  );
  const view = await resourceDetail(owner, v.vehicleId);
  expect(JSON.stringify(view)).not.toContain("PRIVATE RENTER");
});
it("avoids policy-approval and scheduling lock inversion", async () => {
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
    { ...policy.payload, consent: true },
    policy.version,
  );
  policy = await submitApplication(operator, app.id, policy.version);
  const barrier = await db.connect();
  await barrier.query("BEGIN");
  await barrier.query("SELECT id FROM agency WHERE id=$1 FOR UPDATE", [
    agencyId,
  ]);
  async function waitForWaiters(n: number) {
    for (let i = 0; i < 100; i++) {
      const count = Number(
        (
          await db.query(
            "SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query ILIKE '%agency%'",
          )
        ).rows[0].n,
      );
      if (count >= n) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw Error("Expected agency lock waiter was not observed.");
  }
  let approval: Promise<any> | undefined, creation: Promise<any> | undefined;
  try {
    approval = reviewApplication(
      admin,
      app.id,
      policy.version,
      "APPROVE",
      "Synthetic policy amendment approved independently.",
    );
    await waitForWaiters(1);
    creation = createDriver(operator, {
      agencyId,
      name: "Concurrent synthetic driver",
      phone: "+639171234567",
      licenseNumber: `RACE-${randomUUID().slice(0, 8)}`,
      licenseExpiry: "2099-12-31",
    });
    await waitForWaiters(2);
    await barrier.query("COMMIT");
  } finally {
    await barrier.query("ROLLBACK");
    barrier.release();
  }
  const results = await Promise.allSettled([approval!, creation!]);
  expect(
    results.map((r) =>
      r.status === "fulfilled"
        ? "fulfilled"
        : {
            status: r.status,
            code: r.reason?.code,
            domainStatus: r.reason?.status,
            name: r.reason?.name,
            message:
              r.reason instanceof DomainError ? r.reason.message : undefined,
          },
    ),
  ).toEqual(["fulfilled", "fulfilled"]);
}, 30000);
