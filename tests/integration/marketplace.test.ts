import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import { approvedAgency } from "../helpers/agency";
import {
  createVehicleOffer,
  transitionVehicleOffer,
  saveVehicleDraft,
} from "../../src/modules/vehicles/service";
import {
  createBlock,
  createDriver,
  cancelBlock,
} from "../../src/modules/resources/service";
import { searchVehicles } from "../../src/modules/marketplace/vehicles";
import type { Actor } from "../../src/modules/partners/workflow";
const operator: Actor = { id: randomUUID(), role: "RENTER" },
  admin: Actor = { id: randomUUID(), role: "SUPER_ADMIN" };
let agencyId: string,
  cars: any[] = [];
const window = {
  startAt: "2031-06-01T08:00:00+08:00",
  endAt: "2031-06-02T08:00:00+08:00",
};
beforeAll(async () => {
  if (
    !process.env.TEST_DATABASE_URL ||
    process.env.NEON_PROJECT_ID !== "floral-flower-08375841"
  )
    throw Error("Use isolated test DB.");
  for (const a of [operator, admin])
    await db.query(
      "INSERT INTO app_actor(id,email,name,role)VALUES($1,$2,'Synthetic search tester',$3)",
      [a.id, `${a.id}@example.test`, a.role],
    );
  agencyId = await approvedAgency(operator, admin, {
    services: ["SELF_DRIVE", "WITH_DRIVER"],
    driverFeeCentavos: 50000,
    driverFeeUnit: "PER_BOOKING",
    bufferMinutes: 30,
  });
  for (const [model, seats, rate, transmission] of [
    ["Alpha", 5, 200000, "AUTOMATIC"],
    ["Beta", 8, 350000, "MANUAL"],
    ["Gamma", 5, 300000, "AUTOMATIC"],
  ] as const) {
    let v = await createVehicleOffer(operator, {
      ownership: "AGENCY_OWNED",
      agencyId,
      registration: `MK${randomUUID().replaceAll("-", "").slice(0, 10)}`,
      facts: {
        make: "Synthetic",
        model,
        year: 2024,
        seats,
        transmission,
        fuel: "GASOLINE",
        bodyType: "SUV",
        description: "Synthetic marketplace test vehicle.",
        features: ["Air conditioning"],
        pickupInstructions: "Synthetic agency office.",
      },
    });
    v = await saveVehicleDraft(operator, v.id, v.version, {
      facts: v.facts,
      terms: { ...v.terms, rateCentavos: rate },
    });
    for (const purpose of ["OWNERSHIP", "PHOTO"])
      await db.query(
        "INSERT INTO vehicle_file(id,vehicle_id,uploader_id,purpose,object_key,original_name,mime,size_bytes,sha256,backend)VALUES($1,$2,$3,$4,$5,'synthetic.png','image/png',10,'test','local')",
        [
          randomUUID(),
          v.vehicleId,
          operator.id,
          purpose,
          `${v.vehicleId}/${randomUUID()}`,
        ],
      );
    v = await transitionVehicleOffer(operator, v.id, {
      action: "SUBMIT",
      version: v.version,
      revision: 0,
    });
    v = await transitionVehicleOffer(admin, v.id, {
      action: "APPROVE",
      version: v.version,
      revision: v.revision,
      reason: "Synthetic vehicle evidence reviewed independently.",
    });
    v = await transitionVehicleOffer(operator, v.id, {
      action: "PUBLISH",
      version: v.version,
      revision: v.revision,
    });
    cars.push(v);
  }
}, 60000);
afterAll(() => db.end());
it("uses current labels without rewriting approved specifications or price history",async()=>{
 const id=cars[0].id;
 const snapshot=await db.query("SELECT facts FROM vehicle_revision WHERE offer_id=$1 ORDER BY revision",[id]);
 const before=(await searchVehicles({agencyId})).items.find(c=>c.id===id)!;
 try{
  await db.query("UPDATE vehicle_offer SET display_make='Toyota',display_model='Vios' WHERE id=$1",[id]);
  await db.query("UPDATE agency SET display_name='Bicol Journeys Travel & Tours' WHERE id=$1",[agencyId]);
  const found=await searchVehicles({agencyId,search:'Vios'});
  expect(found.items.map(c=>c.id)).toEqual([id]);
  expect(found.items[0].facts.make).toBe('Toyota');
  expect(found.items[0].agencyName).toBe('Bicol Journeys Travel & Tours');
  expect(found.items[0].pricing).toEqual(before.pricing);
  expect((await db.query("SELECT facts FROM vehicle_revision WHERE offer_id=$1 ORDER BY revision",[id])).rows).toEqual(snapshot.rows);
 }finally{
  await db.query("UPDATE vehicle_offer SET display_make=NULL,display_model=NULL WHERE id=$1",[id]);
  await db.query("UPDATE agency SET display_name=NULL WHERE id=$1",[agencyId]);
 }
});
it("filters the approved public projection and sorts before pagination", async () => {
  const q = { agencyId };
  const all = await searchVehicles({ ...q, sort: "PRICE_ASC", pageSize: 1 });
  expect(all.total).toBe(3);
  expect(all.categoryCounts).toEqual({ SUV: 3 });
  const emptyCategory = await searchVehicles({ ...q, bodyType: "SEDAN", minRateCentavos: 300000 });
  expect(emptyCategory).toMatchObject({ total: 0, items: [], categoryCounts: { SUV: 2 }, allCategories: 2 });
  const filteredCategory = await searchVehicles({ ...q, bodyType: "SUV", minRateCentavos: 300000 });
  expect(filteredCategory.items.map(car=>car.id)).toEqual([cars[2].id, cars[1].id]);
  expect(all.items[0].id).toBe(cars[0].id);
  expect(
    (await searchVehicles({ ...q, sort: "PRICE_ASC", pageSize: 1, page: 2 }))
      .items[0].id,
  ).toBe(cars[2].id);
  expect(
    (await searchVehicles({ ...q, partySize: 6 })).items.map((r) => r.id),
  ).toEqual([cars[1].id]);
  expect(
    (
      await searchVehicles({
        ...q,
        transmission: "AUTOMATIC",
        maxRateCentavos: 250000,
      })
    ).total,
  ).toBe(1);
  expect((await searchVehicles({ ...q, search: "Beta" })).total).toBe(1);
  expect((await searchVehicles({ ...q, search: "%" })).total).toBe(0);
  expect((await searchVehicles({ agencyId: randomUUID() })).total).toBe(0);
  expect(JSON.stringify(all)).not.toMatch(
    /registration|ownerId|object_key|sha256|shares|license|phone/,
  );
});
it("checks actual intervals and the agency turnaround buffer without hiding adjacent availability", async () => {
  const claim = await createBlock(operator, cars[0].vehicleId, {
    kind: "MAINTENANCE",
    startAt: window.endAt,
    endAt: "2031-06-02T09:00:00+08:00",
    note: "Synthetic service begins during the vehicle turnaround.",
  });
  expect(
    (
      await searchVehicles({ agencyId, ...window, mode: "SELF_DRIVE" })
    ).items.some((r) => r.id === cars[0].id),
  ).toBe(false);
  await cancelBlock(
    operator,
    claim.id,
    "Synthetic maintenance block released after verification.",
  );
  const free = await searchVehicles({
    agencyId,
    ...window,
    mode: "SELF_DRIVE",
  });
  expect(free.total).toBe(3);
  expect(free.items[0].availabilityChecked).toBe(true);
});
it("requires a free licensed driver and accounts for the driver's seat", async () => {
  expect(
    (await searchVehicles({ agencyId, ...window, mode: "WITH_DRIVER" })).total,
  ).toBe(0);
  const d = await createDriver(operator, {
    agencyId,
    name: "Synthetic search driver",
    phone: "09171234567",
    licenseNumber: `MK${randomUUID().replaceAll("-", "").slice(0, 12)}`,
    licenseExpiry: "2099-12-31",
  });
  const q = { agencyId, ...window, mode: "WITH_DRIVER", partySize: 5 };
  const matches = await searchVehicles(q);
  expect(matches.total).toBe(1);
  expect(matches.items[0].id).toBe(cars[1].id);
  expect(JSON.stringify(matches)).not.toContain(d.id);
  const block = await createBlock(operator, d.id, {
    ...window,
    kind: "UNAVAILABLE",
    note: "Synthetic driver assignment conflict.",
  });
  expect((await searchVehicles(q)).total).toBe(0);
  await cancelBlock(operator, block.id, "Synthetic driver is available again.");
});
it("ranks actual budget and stated preferences with honest explanations", async () => {
  const result = await searchVehicles({
    agencyId,
    ...window,
    mode: "SELF_DRIVE",
    budgetCentavos: 310000,
    preferredTransmission: "MANUAL",
    sort: "RECOMMENDED",
  });
  expect(result.items[0].id).toBe(cars[0].id);
  expect(result.items[2].id).toBe(cars[1].id);
  expect(result.items[0].estimate?.serviceCentavos).toBe(200000);
  expect(result.items[0].estimate?.refundableDepositCentavos).toBe(300000);
  expect(result.items[0].reasons.join(" ")).toMatch(/budget/);
  expect(JSON.stringify(result)).not.toMatch(/popular|rating|booked by/);
});
it("hides withdrawn inventory immediately", async () => {
  let c = cars[2];
  await transitionVehicleOffer(operator, c.id, {
    action: "UNPUBLISH",
    version: c.version,
    revision: c.revision,
    reason: "Synthetic listing withdrawn from new requests.",
  });
  expect(
    (await searchVehicles({ agencyId })).items.some((r) => r.id === c.id),
  ).toBe(false);
});
