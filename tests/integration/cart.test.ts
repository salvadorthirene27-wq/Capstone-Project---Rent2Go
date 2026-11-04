import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import { approvedAgency } from "../helpers/agency";
import {
  createVehicleOffer,
  saveVehicleDraft,
  transitionVehicleOffer,
} from "../../src/modules/vehicles/service";
import {
  createTour,
  attachTourPhoto,
  publishTour,
  createTourSchedule,
} from "../../src/modules/tours/service";
import { createBlock, cancelBlock } from "../../src/modules/resources/service";
import {
  quoteCartSelection,
  addToCart,
  readCart,
  updateCartItem,
  removeCartItem,
} from "../../src/modules/cart/service";
import type { Actor } from "../../src/modules/partners/workflow";
const owner: Actor = { id: randomUUID(), role: "RENTER" },
  owner2: Actor = { id: randomUUID(), role: "RENTER" },
  renter: Actor = { id: randomUUID(), role: "RENTER" },
  other: Actor = { id: randomUUID(), role: "RENTER" },
  admin: Actor = { id: randomUUID(), role: "SUPER_ADMIN" };
let agencyId: string,
  agency2Id: string,
  car: any,
  car2: any,
  group: any,
  privateTour: any,
  groupSlot: string,
  privateSlot: string;
const times = {
  startAt: "2031-08-01T08:00:00+08:00",
  endAt: "2031-08-02T08:00:00+08:00",
};
const rental = (offer = car) => ({
  kind: "RENTAL",
  offerId: offer.id,
  ...times,
  mode: "SELF_DRIVE",
  partySize: 3,
});
async function vehicle(actor: Actor, agency: string) {
  let c = await createVehicleOffer(actor, {
    ownership: "AGENCY_OWNED",
    agencyId: agency,
    registration: `CT${randomUUID().replaceAll("-", "").slice(0, 10)}`,
    facts: {
      make: "Synthetic",
      model: "Cart Car",
      year: 2024,
      seats: 5,
      transmission: "AUTOMATIC",
      fuel: "GASOLINE",
      bodyType: "SEDAN",
      description: "Synthetic cart fixture, not a real rental vehicle.",
      features: [],
      pickupInstructions: "Synthetic agency office.",
    },
  });
  for (const purpose of ["OWNERSHIP", "PHOTO"])
    await db.query(
      "INSERT INTO vehicle_file(id,vehicle_id,uploader_id,purpose,object_key,original_name,mime,size_bytes,sha256,backend)VALUES($1,$2,$3,$4,$5,'synthetic.png','image/png',10,'test','local')",
      [
        randomUUID(),
        c.vehicleId,
        actor.id,
        purpose,
        `${c.vehicleId}/${randomUUID()}`,
      ],
    );
  c = await transitionVehicleOffer(actor, c.id, {
    action: "SUBMIT",
    version: c.version,
    revision: c.revision,
  });
  c = await transitionVehicleOffer(admin, c.id, {
    action: "APPROVE",
    version: c.version,
    revision: c.revision,
    reason: "Independent synthetic cart vehicle review.",
  });
  return transitionVehicleOffer(actor, c.id, {
    action: "PUBLISH",
    version: c.version,
    revision: c.revision,
  });
}
async function tour(mode: string) {
  let t = await createTour(owner, {
    agencyId,
    payload: {
      title: `Synthetic ${mode} cart tour`,
      mode,
      description: "Synthetic itinerary for cart workflow testing.",
      serviceArea: "Albay",
      meetingPoint: "Synthetic agency office",
      itinerary: [
        {
          title: "First stop",
          description: "Synthetic guided itinerary stop.",
        },
      ],
      inclusions: "Guide",
      exclusions: "Meals",
      eligibilityTerms: "Guest identity and attendance review.",
      terms: "Tour-only service and published guest rules.",
      cancellationPolicy: "Request before the tour starts.",
      refundPolicy: "A separate reconciled refund review.",
      priceCentavos: 100000,
      minParty: 1,
      maxParty: 8,
      transportIncluded: false,
      fulfillment: "TOUR_ONLY",
    },
  });
  t.version = (
    await attachTourPhoto(owner, t.id, t.version, {
      id: randomUUID(),
      name: "synthetic.png",
      mime: "image/png",
      size: 10,
      sha256: "0".repeat(64),
      backend: "local",
    })
  ).version;
  t = await publishTour(owner, t.id, t.version);
  const s = await createTourSchedule(owner, t.id, t.version, {
    startAt: times.startAt,
    endAt: times.endAt,
    cutoffAt: "2031-07-31T17:00:00+08:00",
    capacity: mode === "GROUP" ? 20 : 8,
  });
  return { tour: t, slot: s.id };
}
beforeAll(async () => {
  if (
    !process.env.TEST_DATABASE_URL ||
    process.env.NEON_PROJECT_ID !== "floral-flower-08375841"
  )
    throw Error("Use isolated test DB.");
  for (const a of [owner, owner2, renter, other, admin])
    await db.query(
      "INSERT INTO app_actor(id,email,name,role)VALUES($1,$2,'Synthetic cart tester',$3)",
      [a.id, `${a.id}@example.test`, a.role],
    );
  agencyId = await approvedAgency(owner, admin, {
    services: ["SELF_DRIVE", "GROUP_TOUR", "PRIVATE_TOUR"],
    perPersonCentavos: 100000,
    perPartyCentavos: 100000,
  });
  agency2Id = await approvedAgency(owner2, admin);
  car = await vehicle(owner, agencyId);
  car2 = await vehicle(owner2, agency2Id);
  ({ tour: group, slot: groupSlot } = await tour("GROUP"));
  ({ tour: privateTour, slot: privateSlot } = await tour("PRIVATE"));
}, 120000);
afterAll(() => db.end());
async function add(actor: Actor, selection: unknown) {
  const q = await quoteCartSelection(actor, selection);
  return addToCart(actor, { selection, quoteDigest: q.digest });
}
it("does not create a cart on read and keeps server-derived rental estimates private to their owner", async () => {
  expect((await readCart(renter)).totalItems).toBe(0);
  expect(
    (
      await db.query("SELECT 1 FROM booking_cart WHERE owner_id=$1", [
        renter.id,
      ])
    ).rowCount,
  ).toBe(0);
  const q = await quoteCartSelection(renter, rental());
  expect(q.estimate).toMatchObject({
    serviceCentavos: 200000,
    refundableDepositCentavos: 300000,
    estimatedDueCentavos: 500000,
  });
  expect(JSON.stringify(q)).not.toMatch(
    /shares|owner_actor|license_number|object_key|registration/,
  );
  const item = await addToCart(renter, {
      selection: rental(),
      quoteDigest: q.digest,
    }),
    view = await readCart(renter);
  expect(view.totalItems).toBe(1);
  expect(view.groups[0].agencyId).toBe(agencyId);
  expect((await readCart(other)).totalItems).toBe(0);
  await expect(removeCartItem(other, item.id, 1)).rejects.toMatchObject({
    status: 404,
  });
  await expect(
    addToCart(renter, {
      selection: rental(),
      quoteDigest: q.digest,
      priceCentavos: 1,
      agencyId: agency2Id,
    }),
  ).rejects.toThrow();
});
it("deduplicates concurrent add retries without creating reservations", async () => {
  const selection = {
      ...rental(),
      startAt: "2031-08-03T08:00:00+08:00",
      endAt: "2031-08-04T08:00:00+08:00",
    },
    q = await quoteCartSelection(renter, selection);
  const results = await Promise.all([
    addToCart(renter, { selection, quoteDigest: q.digest }),
    addToCart(renter, { selection, quoteDigest: q.digest }),
  ]);
  expect(results[0].id).toBe(results[1].id);
  expect(results.some((r) => r.duplicate)).toBe(true);
  expect(
    (
      await db.query(
        "SELECT count(*)::int n FROM resource_occupation WHERE resource_id=$1",
        [car.vehicleId],
      )
    ).rows[0].n,
  ).toBe(0);
});
it("prices group guests and private parties correctly and groups services by actual agency", async () => {
  await add(renter, {
    kind: "TOUR",
    tourId: group.id,
    scheduleId: groupSlot,
    partySize: 3,
  });
  await add(renter, {
    kind: "TOUR",
    tourId: privateTour.id,
    scheduleId: privateSlot,
    partySize: 3,
  });
  await add(renter, rental(car2));
  const view = await readCart(renter),
    lines = view.groups.flatMap((g) => g.items);
  expect(view.groups).toHaveLength(2);
  expect(
    lines.find(
      (l) => l.selection.kind === "TOUR" && l.selection.tourId === group.id,
    )?.savedQuote.estimate.serviceCentavos,
  ).toBe(300000);
  expect(
    lines.find(
      (l) =>
        l.selection.kind === "TOUR" && l.selection.tourId === privateTour.id,
    )?.savedQuote.estimate.serviceCentavos,
  ).toBe(100000);
  expect(
    (
      await db.query(
        "SELECT reserved_units FROM tour_schedule WHERE id=ANY($1::uuid[])",
        [[groupSlot, privateSlot]],
      )
    ).rows.every((r) => r.reserved_units === 0),
  ).toBe(true);
});
it("rejects stale item versions and requires the exact newly reviewed quote", async () => {
  const selection = {
      kind: "TOUR",
      tourId: group.id,
      scheduleId: groupSlot,
      partySize: 2,
    },
    q = await quoteCartSelection(other, selection),
    item = await addToCart(other, { selection, quoteDigest: q.digest });
  const next = { ...selection, partySize: 4 },
    reviewed = await quoteCartSelection(other, next);
  await expect(
    updateCartItem(other, item.id, 1, {
      selection: next,
      quoteDigest: q.digest,
    }),
  ).rejects.toMatchObject({ status: 409 });
  await updateCartItem(other, item.id, 1, {
    selection: next,
    quoteDigest: reviewed.digest,
  });
  await expect(removeCartItem(other, item.id, 1)).rejects.toMatchObject({
    status: 409,
  });
  await removeCartItem(other, item.id, 2);
  expect((await readCart(other)).totalItems).toBe(0);
});
it("flags changed publication prices without silently rewriting saved estimates", async () => {
  car = await transitionVehicleOffer(owner, car.id, {
    action: "UNPUBLISH",
    version: car.version,
    revision: car.revision,
    reason: "Synthetic price revision for stale-cart test.",
  });
  car = await transitionVehicleOffer(owner, car.id, {
    action: "AMEND",
    version: car.version,
    revision: car.revision,
  });
  car = await saveVehicleDraft(owner, car.id, car.version, {
    facts: car.facts,
    terms: { ...car.terms, rateCentavos: 250000 },
  });
  car = await transitionVehicleOffer(owner, car.id, {
    action: "SUBMIT",
    version: car.version,
    revision: car.revision,
  });
  car = await transitionVehicleOffer(admin, car.id, {
    action: "APPROVE",
    version: car.version,
    revision: car.revision,
    reason: "Independent revised synthetic terms review.",
  });
  car = await transitionVehicleOffer(owner, car.id, {
    action: "PUBLISH",
    version: car.version,
    revision: car.revision,
  });
  const view = await readCart(renter),
    line = view.groups
      .flatMap((g) => g.items)
      .find(
        (i) => i.selection.kind === "RENTAL" && i.selection.offerId === car.id,
      )!;
  expect(line.status).toBe("CHANGED");
  expect(line.savedQuote.estimate.serviceCentavos).toBe(200000);
  expect(line.currentQuote?.estimate.serviceCentavos).toBe(250000);
  expect(view.readyToRequest).toBe(false);
  await expect(
    updateCartItem(renter, line.id, line.version, {
      selection: line.selection,
      quoteDigest: line.savedQuote.digest,
    }),
  ).rejects.toMatchObject({ status: 409 });
});
it("reports temporary unavailability without erasing a saved selection", async () => {
  const block = await createBlock(owner, car.vehicleId, {
    ...times,
    kind: "MAINTENANCE",
    note: "Synthetic maintenance now conflicts with saved dates.",
  });
  const view = await readCart(renter),
    line = view.groups
      .flatMap((g) => g.items)
      .find(
        (i) =>
          i.selection.kind === "RENTAL" &&
          i.selection.offerId === car.id &&
          i.selection.startAt === new Date(times.startAt).toISOString(),
      )!;
  expect(line.status).toBe("UNAVAILABLE");
  expect(line.savedQuote.estimate.serviceCentavos).toBe(200000);
  await cancelBlock(
    owner,
    block.id,
    "Synthetic maintenance conflict removed after testing.",
  );
});
it("rejects invalid intervals and duplicate guest variants, and serializes competing updates", async () => {
  await expect(
    quoteCartSelection(other, { ...rental(), endAt: times.startAt }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    quoteCartSelection(other, { ...rental(), partySize: 6 }),
  ).rejects.toMatchObject({ status: 409 });
  const selection = {
      kind: "TOUR",
      tourId: group.id,
      scheduleId: groupSlot,
      partySize: 1,
    },
    first = await add(other, selection);
  const changed = { ...selection, partySize: 2 },
    q = await quoteCartSelection(other, changed);
  await expect(
    addToCart(other, { selection: changed, quoteDigest: q.digest }),
  ).rejects.toMatchObject({ status: 409 });
  const updates = await Promise.allSettled([
    updateCartItem(other, first.id, 1, {
      selection: changed,
      quoteDigest: q.digest,
    }),
    updateCartItem(other, first.id, 1, {
      selection: changed,
      quoteDigest: q.digest,
    }),
  ]);
  expect(updates.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    (updates.find((r) => r.status === "rejected") as PromiseRejectedResult)
      .reason,
  ).toMatchObject({ status: 409 });
});
