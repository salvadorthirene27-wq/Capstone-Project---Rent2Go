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
  createTour,
  attachTourPhoto,
  publishTour,
  createTourSchedule,
  cancelTourSchedule,
} from "../../src/modules/tours/service";
import {
  addToCart,
  quoteCartSelection,
  readCart,
} from "../../src/modules/cart/service";
import {
  submitBookingRequests,
  getBookingRequest,
  listBookingRequests,
} from "../../src/modules/bookings/service";
import type { Actor } from "../../src/modules/partners/workflow";
const owner: Actor = { id: randomUUID(), role: "RENTER" },
  owner2: Actor = { id: randomUUID(), role: "RENTER" },
  admin: Actor = { id: randomUUID(), role: "SUPER_ADMIN" },
  renter: Actor = { id: randomUUID(), role: "RENTER" },
  other: Actor = { id: randomUUID(), role: "RENTER" };
let agency: string, agency2: string, car: any, tour: any, slot: any;
const window = {
  startAt: "2031-09-01T00:00:00Z",
  endAt: "2031-09-02T00:00:00Z",
};
const contact = {
  name: "Synthetic booking guest",
  phone: "+639171234567",
  notes: "Synthetic request for workflow tests.",
};
async function add(actor: Actor, selection: unknown) {
  const q = await quoteCartSelection(actor, selection);
  return addToCart(actor, { selection, quoteDigest: q.digest });
}
async function command(actor: Actor, key = randomUUID()) {
  const c = await readCart(actor);
  return {
    idempotencyKey: key,
    cartVersion: c.version,
    items: c.groups
      .flatMap((g) => g.items)
      .map((i) => ({
        id: i.id,
        version: i.version,
        quoteDigest: i.savedQuote.digest,
      })),
    contact,
  };
}
beforeAll(async () => {
  if (
    !process.env.TEST_DATABASE_URL ||
    process.env.NEON_PROJECT_ID !== "floral-flower-08375841"
  )
    throw Error("Use isolated test DB.");
  for (const a of [owner, owner2, admin, renter, other])
    await db.query(
      "INSERT INTO app_actor(id,email,name,role)VALUES($1,$2,'Synthetic request tester',$3)",
      [a.id, `${a.id}@example.test`, a.role],
    );
  agency = await approvedAgency(owner, admin);
  agency2 = await approvedAgency(owner2, admin, {
    services: ["GROUP_TOUR"],
    perPersonCentavos: 100000,
  });
  car = await createVehicleOffer(owner, {
    ownership: "AGENCY_OWNED",
    agencyId: agency,
    registration: `BR${randomUUID().replaceAll("-", "").slice(0, 10)}`,
    facts: {
      make: "Synthetic",
      model: "Request Car",
      year: 2024,
      seats: 5,
      transmission: "AUTOMATIC",
      fuel: "GASOLINE",
      bodyType: "SEDAN",
      description: "Synthetic booking request test car.",
      features: [],
      pickupInstructions: "Synthetic agency office.",
    },
  });
  for (const purpose of ["OWNERSHIP", "PHOTO"])
    await db.query(
      "INSERT INTO vehicle_file(id,vehicle_id,uploader_id,purpose,object_key,original_name,mime,size_bytes,sha256,backend)VALUES($1,$2,$3,$4,$5,'synthetic.png','image/png',10,'test','local')",
      [
        randomUUID(),
        car.vehicleId,
        owner.id,
        purpose,
        `${car.vehicleId}/${randomUUID()}`,
      ],
    );
  for (const [a, action] of [
    [owner, "SUBMIT"],
    [admin, "APPROVE"],
    [owner, "PUBLISH"],
  ] as const)
    car = await transitionVehicleOffer(a, car.id, {
      action,
      version: car.version,
      revision: car.revision,
      reason: "Independent synthetic request fixture review.",
    });
  tour = await createTour(owner2, {
    agencyId: agency2,
    payload: {
      title: "Synthetic request tour",
      mode: "GROUP",
      description: "Synthetic group itinerary for request testing.",
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
  tour.version = (
    await attachTourPhoto(owner2, tour.id, tour.version, {
      id: randomUUID(),
      name: "synthetic.png",
      mime: "image/png",
      size: 10,
      sha256: "0".repeat(64),
      backend: "local",
    })
  ).version;
  tour = await publishTour(owner2, tour.id, tour.version);
  slot = await createTourSchedule(owner2, tour.id, tour.version, {
    ...window,
    cutoffAt: "2031-08-31T00:00:00Z",
    capacity: 20,
  });
}, 120000);
afterAll(() => db.end());
it("atomically groups requests by actual agency, snapshots prices and leaves inventory unreserved", async () => {
  await add(renter, {
    kind: "RENTAL",
    offerId: car.id,
    ...window,
    mode: "SELF_DRIVE",
    partySize: 2,
  });
  await add(renter, {
    kind: "TOUR",
    tourId: tour.id,
    scheduleId: slot.id,
    partySize: 3,
  });
  const input = await command(renter),
    results = await Promise.all([
      submitBookingRequests(renter, input),
      submitBookingRequests(renter, input),
    ]);
  expect(results[0]).toEqual(results[1]);
  expect(results[0].requests).toHaveLength(2);
  expect((await readCart(renter)).totalItems).toBe(0);
  for (const req of results[0].requests) {
    const detail = await getBookingRequest(renter, req.id);
    expect(detail.status).toBe("REQUIREMENTS_PENDING");
    expect(detail.contact).toMatchObject(contact);
    expect(JSON.stringify(detail)).not.toMatch(
      /private_financial|shares|registration|object_key/,
    );
    expect(detail.events).toHaveLength(1);
  }
  expect(
    (
      await db.query(
        "SELECT count(*)::int n FROM resource_occupation WHERE resource_id=$1",
        [car.vehicleId],
      )
    ).rows[0].n,
  ).toBe(0);
  expect(
    (
      await db.query("SELECT reserved_units FROM tour_schedule WHERE id=$1", [
        slot.id,
      ])
    ).rows[0].reserved_units,
  ).toBe(0);
  await expect(
    submitBookingRequests(renter, {
      ...input,
      contact: { ...contact, notes: "Different command using the same key." },
    }),
  ).rejects.toMatchObject({ status: 409 });
  const foreign = results[0].requests[0];
  await expect(getBookingRequest(other, foreign.id)).rejects.toMatchObject({
    status: 404,
  });
  await expect(getBookingRequest(admin, foreign.id)).rejects.toMatchObject({
    status: 404,
  });
  const agencyQueue = await listBookingRequests(owner, { agencyId: agency });
  expect(agencyQueue.items).toHaveLength(1);
  expect(agencyQueue.items[0].agencyId).toBe(agency);
  await expect(
    listBookingRequests(other, { agencyId: agency }),
  ).rejects.toMatchObject({ status: 403 });
}, 60000);
it("rejects an entire mixed-agency checkout if one departure becomes unavailable", async () => {
  await add(other, {
    kind: "RENTAL",
    offerId: car.id,
    ...window,
    mode: "SELF_DRIVE",
    partySize: 1,
  });
  await add(other, {
    kind: "TOUR",
    tourId: tour.id,
    scheduleId: slot.id,
    partySize: 2,
  });
  const input = await command(other);
  await cancelTourSchedule(
    owner2,
    slot.id,
    "Synthetic departure cancellation before request submission.",
  );
  await expect(submitBookingRequests(other, input)).rejects.toMatchObject({
    status: 409,
  });
  expect((await readCart(other)).totalItems).toBe(2);
  expect(
    (
      await db.query("SELECT 1 FROM booking_request WHERE renter_id=$1", [
        other.id,
      ])
    ).rowCount,
  ).toBe(0);
}, 60000);
it("rejects stale cart versions, foreign item IDs and client financial overrides", async () => {
  const input = await command(other),
    own = await command(owner);
  await expect(
    submitBookingRequests(other, {
      ...input,
      cartVersion: input.cartVersion - 1,
    }),
  ).rejects.toThrow();
  await expect(
    submitBookingRequests(owner, {
      ...input,
      cartVersion: own.cartVersion || 1,
    }),
  ).rejects.toThrow();
  await expect(
    submitBookingRequests(other, {
      ...input,
      agencyId: agency,
      totalCentavos: 1,
    }),
  ).rejects.toThrow();
});
it("retains immutable server-owned allocation snapshots and rejects client changes to history", async () => {
  const rows = (
    await db.query(
      "SELECT l.id,l.private_financial_snapshot snapshot FROM booking_request_line l JOIN booking_request r ON r.id=l.request_id WHERE r.renter_id=$1",
      [renter.id],
    )
  ).rows;
  expect(
    rows.find((r) => r.snapshot.category === "AGENCY_OWNED").snapshot.shares,
  ).toEqual({ cosigner: 0, agency: 8000, platform: 1000, maintenance: 1000 });
  expect(
    rows.find((r) => r.snapshot.category === "TOUR_ONLY").snapshot.shares,
  ).toEqual({ cosigner: 0, agency: 9000, platform: 1000, maintenance: 0 });
  await expect(
    db.query("UPDATE booking_request_line SET public_quote='{}' WHERE id=$1", [
      rows[0].id,
    ]),
  ).rejects.toThrow("immutable");
});
it("requires explicit cart review after a price publication changes and preserves submitted snapshots", async () => {
  await add(owner, {
    kind: "RENTAL",
    offerId: car.id,
    ...window,
    mode: "SELF_DRIVE",
    partySize: 2,
  });
  const input = await command(owner);
  for (const action of ["UNPUBLISH", "AMEND"] as const)
    car = await transitionVehicleOffer(owner, car.id, {
      action,
      version: car.version,
      revision: car.revision,
      reason: "Synthetic post-request price revision.",
    });
  car = await saveVehicleDraft(owner, car.id, car.version, {
    facts: car.facts,
    terms: { ...car.terms, rateCentavos: 250000 },
  });
  for (const [who, action] of [
    [owner, "SUBMIT"],
    [admin, "APPROVE"],
    [owner, "PUBLISH"],
  ] as const)
    car = await transitionVehicleOffer(who, car.id, {
      action,
      version: car.version,
      revision: car.revision,
      reason: "Independent revised synthetic pricing review.",
    });
  await expect(submitBookingRequests(owner, input)).rejects.toMatchObject({
    status: 409,
  });
  expect((await readCart(owner)).totalItems).toBe(1);
  const id = (
    await db.query(
      "SELECT id FROM booking_request WHERE renter_id=$1 AND agency_id=$2",
      [renter.id, agency],
    )
  ).rows[0].id;
  expect(
    (await getBookingRequest(renter, id)).lines[0].quote.estimate
      .serviceCentavos,
  ).toBe(200000);
}, 60000);
it("clears only submitted selections and rejects an empty selection", async () => {
  for (const day of [4, 7])
    await add(renter, {
      kind: "RENTAL",
      offerId: car.id,
      startAt: `2031-09-0${day}T00:00:00Z`,
      endAt: `2031-09-0${day + 1}T00:00:00Z`,
      mode: "SELF_DRIVE",
      partySize: 2,
    });
  const input = await command(renter);
  input.items = input.items.slice(0, 1);
  const result = await submitBookingRequests(renter, input);
  expect(result.requests).toHaveLength(1);
  expect((await readCart(renter)).totalItems).toBe(1);
  await expect(
    submitBookingRequests(renter, { ...(await command(renter)), items: [] }),
  ).rejects.toThrow();
}, 60000);
