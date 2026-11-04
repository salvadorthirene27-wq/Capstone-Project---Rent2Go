import { it, expect } from "vitest";
import {
  tourSchema,
  scheduleSchema,
  tourPrice,
} from "../../src/modules/tours/schema";
const tour = {
  title: "Coastal discovery",
  mode: "GROUP",
  description: "Synthetic coastal itinerary for testing.",
  serviceArea: "Albay",
  meetingPoint: "Agency office",
  itinerary: [
    {
      title: "Coastal visit",
      description: "Guided coastal stop with free time.",
    },
  ],
  inclusions: "Guide and transport",
  exclusions: "Meals",
  eligibilityTerms: "Follow the published age and attendance requirements.",
  terms: "Tour-only service; no separately rented vehicle.",
  cancellationPolicy: "Request cancellation before the departure.",
  refundPolicy: "Refunds require independent reconciliation.",
  priceCentavos: 123450,
  minParty: 1,
  maxParty: 8,
  transportIncluded: true,
  fulfillment: "TOUR_ONLY",
};
it("prices group seats per person and private tours once per party", () => {
  expect(tourPrice(tour, 3)).toEqual({
    unit: "PER_PERSON",
    quantity: 3,
    totalCentavos: 370350,
  });
  expect(tourPrice({ ...tour, mode: "PRIVATE" }, 3)).toEqual({
    unit: "PER_PARTY",
    quantity: 1,
    totalCentavos: 123450,
  });
});
it("rejects incomplete terms, empty itineraries, fractional parties and capacity violations", () => {
  expect(tourSchema.safeParse({ ...tour, itinerary: [] }).success).toBe(false);
  expect(tourSchema.safeParse({ ...tour, priceCentavos: 0 }).success).toBe(
    false,
  );
  expect(tourSchema.safeParse({ ...tour, refundPolicy: "" }).success).toBe(
    false,
  );
  expect(tourSchema.safeParse({ ...tour, minParty: 9 }).success).toBe(false);
  expect(tourSchema.safeParse({ ...tour, fulfillment: "RENTAL" }).success).toBe(
    false,
  );
  for (const size of [0, 1.5, 9]) expect(() => tourPrice(tour, size)).toThrow();
});
it("requires explicit-zone positive schedules and a cutoff before departure", () => {
  const slot = {
    startAt: "2031-05-01T08:00:00+08:00",
    endAt: "2031-05-01T17:00:00+08:00",
    cutoffAt: "2031-04-30T17:00:00+08:00",
    capacity: 20,
  };
  expect(scheduleSchema.safeParse(slot).success).toBe(true);
  expect(
    scheduleSchema.safeParse({ ...slot, endAt: slot.startAt }).success,
  ).toBe(false);
  expect(
    scheduleSchema.safeParse({ ...slot, cutoffAt: slot.endAt }).success,
  ).toBe(false);
  expect(
    scheduleSchema.safeParse({ ...slot, startAt: "2031-05-01T08:00" }).success,
  ).toBe(false);
});
