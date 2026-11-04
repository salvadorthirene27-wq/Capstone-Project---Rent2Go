import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import { approvedAgency } from "../helpers/agency";
import {
  createTour,
  saveTour,
  publishTour,
  withdrawTour,
  tourDetail,
  publicTour,
  createTourSchedule,
  cancelTourSchedule,
  attachTourPhoto,
  removeTourPhoto,
  tourPhotoForRead,
  publicTours,
  listTours,
} from "../../src/modules/tours/service";
import {
  startPolicyRevision,
  saveDraft,
  submitApplication,
  reviewApplication,
} from "../../src/modules/partners/service";
import type { Actor } from "../../src/modules/partners/workflow";
const operator: Actor = { id: randomUUID(), role: "RENTER" },
  outsider: Actor = { id: randomUUID(), role: "RENTER" },
  admin: Actor = { id: randomUUID(), role: "SUPER_ADMIN" };
let agencyId: string;
const facts = {
  title: "Synthetic tour",
  mode: "GROUP",
  description: "Synthetic itinerary, not an actual tour for sale.",
  serviceArea: "Albay",
  meetingPoint: "Synthetic agency office",
  itinerary: [
    {
      title: "Coastal visit",
      description: "Guided visit at the synthetic itinerary stop.",
    },
  ],
  inclusions: "Guide and transport",
  exclusions: "Meals",
  eligibilityTerms: "Check attendance and guest requirements before approval.",
  terms: "Tour-only service; no vehicle rented to the customer.",
  cancellationPolicy: "Request before departure; agency reviews the decision.",
  refundPolicy: "A separate reconciled refund decision is required.",
  priceCentavos: 120000,
  minParty: 1,
  maxParty: 8,
  transportIncluded: true,
  fulfillment: "TOUR_ONLY",
};
const slot = {
  startAt: "2031-05-01T08:00:00+08:00",
  endAt: "2031-05-01T17:00:00+08:00",
  cutoffAt: "2031-04-30T17:00:00+08:00",
  capacity: 20,
};
beforeAll(async () => {
  if (
    !process.env.TEST_DATABASE_URL ||
    process.env.NEON_PROJECT_ID !== "floral-flower-08375841"
  )
    throw Error("Use the isolated test database.");
  for (const a of [operator, outsider, admin])
    await db.query(
      "INSERT INTO app_actor(id,email,name,role)VALUES($1,$2,'Synthetic tour tester',$3)",
      [a.id, `${a.id}@example.test`, a.role],
    );
  agencyId = await approvedAgency(operator, admin, {
    services: ["GROUP_TOUR", "PRIVATE_TOUR"],
    perPersonCentavos: 120000,
    perPartyCentavos: 600000,
  });
}, 30000);
afterAll(() => db.end());
const photo = () => ({
  id: randomUUID(),
  name: "synthetic-tour.png",
  mime: "image/png",
  size: 10,
  sha256: "0".repeat(64),
  backend: "local",
});
async function ready(mode = "GROUP") {
  let t = await createTour(operator, { agencyId, payload: { ...facts, mode } });
  t.version = (
    await attachTourPhoto(operator, t.id, t.version, photo())
  ).version;
  return publishTour(operator, t.id, t.version);
}
it("restricts tour management to the actual approved agency operator", async () => {
  const t = await createTour(operator, { agencyId, payload: facts });
  await expect(tourDetail(outsider, t.id)).rejects.toMatchObject({
    status: 404,
  });
  await expect(
    saveTour(outsider, t.id, t.version, facts),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    createTour(admin, { agencyId, payload: facts }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(publicTour(t.id)).rejects.toMatchObject({ status: 404 });
});
it("publishes complete immutable versions and exposes only current public photos", async () => {
  let t = await createTour(operator, { agencyId, payload: facts });
  await expect(publishTour(operator, t.id, t.version)).rejects.toMatchObject({
    status: 400,
  });
  const f = photo();
  t.version = (await attachTourPhoto(operator, t.id, t.version, f)).version;
  await expect(tourPhotoForRead(null, f.id)).rejects.toMatchObject({
    status: 404,
  });
  t = await publishTour(operator, t.id, t.version);
  const pub = await publicTour(t.id);
  expect(pub.payload.priceCentavos).toBe(120000);
  expect(pub.priceUnit).toBe("PER_PERSON");
  expect(JSON.stringify(pub)).not.toMatch(
    /object_key|sha256|platformBps|uploader/,
  );
  expect((await tourPhotoForRead(null, f.id)).public).toBe(true);
  await expect(
    saveTour(operator, t.id, t.version, { ...facts, priceCentavos: 1 }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    db.query("UPDATE tour_revision SET payload=$1 WHERE tour_id=$2", [
      facts,
      t.id,
    ]),
  ).rejects.toThrow();
  t = await withdrawTour(
    operator,
    t.id,
    t.version,
    "Withdraw synthetic publication to preserve its history.",
  );
  await expect(tourPhotoForRead(null, f.id)).rejects.toMatchObject({
    status: 404,
  });
  t = await saveTour(operator, t.id, t.version, {
    ...facts,
    priceCentavos: 150000,
  });
  t.version = (await removeTourPhoto(operator, t.id, t.version, f.id)).version;
  t.version = (
    await attachTourPhoto(operator, t.id, t.version, photo())
  ).version;
  t = await publishTour(operator, t.id, t.version);
  expect(t.revision).toBe(2);
  expect((await tourDetail(operator, t.id)).revisions).toHaveLength(2);
}, 30000);
it("uses explicit group capacity and permits separate overlapping group departures", async () => {
  const t = await ready();
  await expect(
    createTourSchedule(operator, t.id, t.version - 1, slot),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    createTourSchedule(operator, t.id, t.version, { ...slot, capacity: 4 }),
  ).rejects.toMatchObject({ status: 400 });
  const a = await createTourSchedule(operator, t.id, t.version, slot),
    b = await createTourSchedule(operator, t.id, t.version, slot);
  expect(a.id).not.toBe(b.id);
  expect((await publicTour(t.id)).schedules).toHaveLength(2);
  await expect(
    createTourSchedule(outsider, t.id, t.version, slot),
  ).rejects.toMatchObject({ status: 403 });
}, 30000);
it("prevents concurrent overlapping private slots but permits adjacent half-open bounds", async () => {
  const t = await ready("PRIVATE"),
    q = { ...slot, capacity: 8 };
  const results = await Promise.allSettled([
    createTourSchedule(operator, t.id, t.version, q),
    createTourSchedule(operator, t.id, t.version, q),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const rejected = results.find((r) => r.status === "rejected");
  expect(rejected?.status === "rejected" && rejected.reason.status).toBe(409);
  await createTourSchedule(operator, t.id, t.version, {
    ...q,
    startAt: q.endAt,
    endAt: "2031-05-01T20:00:00+08:00",
  });
  const pub = await publicTour(t.id);
  expect(pub.priceUnit).toBe("PER_PARTY");
  expect(pub.schedules).toHaveLength(2);
  await expect(
    createTourSchedule(operator, t.id, t.version, {
      ...q,
      capacity: 9,
      startAt: "2031-05-02T08:00:00+08:00",
      endAt: "2031-05-02T17:00:00+08:00",
    }),
  ).rejects.toMatchObject({ status: 400 });
}, 30000);
it("retains schedule cancellations and cannot cancel an allocated departure", async () => {
  const t = await ready(),
    s = await createTourSchedule(operator, t.id, t.version, slot);
  await db.query("UPDATE tour_schedule SET reserved_units=1 WHERE id=$1", [
    s.id,
  ]);
  await expect(
    cancelTourSchedule(operator, s.id, "Cannot erase an allocated departure."),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    db.query("UPDATE tour_schedule SET reserved_units=capacity+1 WHERE id=$1", [
      s.id,
    ]),
  ).rejects.toThrow();
  await db.query("UPDATE tour_schedule SET reserved_units=0 WHERE id=$1", [
    s.id,
  ]);
  await cancelTourSchedule(
    operator,
    s.id,
    "Synthetic departure cancelled before any allocation.",
  );
  await expect(
    cancelTourSchedule(operator, s.id, "Cannot duplicate cancellation."),
  ).rejects.toMatchObject({ status: 409 });
  expect((await publicTour(t.id)).schedules).toHaveLength(0);
  expect(
    (await tourDetail(operator, t.id)).schedules.some(
      (record) => record.id === s.id && record.status === "CANCELLED",
    ),
  ).toBe(true);
}, 30000);
it("searches published tour details with real capacity and tenant scoping", async () => {
  const title = `Distinct tour ${randomUUID()}`;
  let t = await createTour(operator, {
    agencyId,
    payload: { ...facts, title },
  });
  t.version = (
    await attachTourPhoto(operator, t.id, t.version, photo())
  ).version;
  t = await publishTour(operator, t.id, t.version);
  await createTourSchedule(operator, t.id, t.version, slot);
  const result = await publicTours({ search: title, partySize: 2 });
  expect(result.total).toBe(1);
  expect(result.items[0].id).toBe(t.id);
  expect((await publicTours({ search: title, partySize: 9 })).total).toBe(0);
  expect((await publicTours({ search: title, mode: "PRIVATE" })).total).toBe(0);
  expect(
    (await publicTours({ search: title, maxPriceCentavos: 119999 })).total,
  ).toBe(0);
  expect((await publicTours({ search: title, page: 2 })).items).toHaveLength(0);
  expect(
    (await listTours(operator, agencyId)).items.some((r) => r.id === t.id),
  ).toBe(true);
  await expect(listTours(outsider, agencyId)).rejects.toMatchObject({
    status: 403,
  });
}, 30000);
it("uses effective service approval and hides tours after eligibility is removed", async () => {
  const t = await ready(),
    app = (
      await db.query(
        "SELECT p.id,p.version FROM partner_application p JOIN agency a ON a.application_id=p.id WHERE a.id=$1",
        [agencyId],
      )
    ).rows[0];
  let p = await startPolicyRevision(operator, app.id, app.version);
  p = await saveDraft(
    operator,
    app.id,
    {
      ...p.payload,
      services: ["SELF_DRIVE"],
      dailyRateCentavos: 200000,
      consent: true,
    },
    p.version,
  );
  p = await submitApplication(operator, app.id, p.version);
  await publicTour(t.id);
  await reviewApplication(
    admin,
    app.id,
    p.version,
    "APPROVE",
    "Synthetic agency no longer offers either tour model.",
  );
  await expect(publicTour(t.id)).rejects.toMatchObject({ status: 404 });
  await expect(
    createTourSchedule(operator, t.id, t.version, slot),
  ).rejects.toMatchObject({ status: 409 });
}, 30000);
