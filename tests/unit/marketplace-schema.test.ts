import { it, expect } from "vitest";
import { vehicleSearchSchema } from "../../src/modules/marketplace/schema";
import { rentalFilters } from "../../src/modules/marketplace/filters";
it("requires a complete future window and rejects ambiguous sub-millisecond instants", () => {
  const q = {
    startAt: "2031-01-01T08:00:00+08:00",
    endAt: "2031-01-02T08:00:00+08:00",
  };
  expect(vehicleSearchSchema.safeParse({ startAt: q.startAt }).success).toBe(
    false,
  );
  expect(
    vehicleSearchSchema.safeParse({ ...q, endAt: q.startAt }).success,
  ).toBe(false);
  expect(
    vehicleSearchSchema.safeParse({
      ...q,
      startAt: "2031-01-01T08:00:00.0001+08:00",
    }).success,
  ).toBe(false);
  expect(
    vehicleSearchSchema.safeParse({ budgetCentavos: 200000 }).success,
  ).toBe(false);
  expect(
    vehicleSearchSchema.safeParse({ ...q, pageSize: 100000 }).success,
  ).toBe(false);
});
it("keeps money filters when a result page link carries canonical query parameters", () => {
  const parsed = rentalFilters({
    startAt: "2031-01-01T08:00:00+08:00",
    endAt: "2031-01-02T08:00:00+08:00",
    budgetCentavos: "300000",
    maxRateCentavos: "200000",
    page: "2",
  });
  expect(parsed.error).toBeNull();
  expect(parsed.query.budgetCentavos).toBe(300000);
  expect(parsed.query.maxRateCentavos).toBe(200000);
  expect(parsed.query.page).toBe(2);
});
