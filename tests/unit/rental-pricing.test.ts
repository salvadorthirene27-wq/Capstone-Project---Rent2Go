import { it, expect } from "vitest";
import { rentalEstimate } from "../../src/modules/pricing/rental";
const pricing = {
  billingUnit: "24_HOUR",
  rateCentavos: 200000,
  depositCentavos: 300000,
  driverFeeCentavos: 50000,
  driverFeeUnit: "PER_BOOKING",
  modes: ["SELF_DRIVE", "WITH_DRIVER"],
};
const start = "2031-01-01T23:00:00+08:00",
  end = "2031-01-02T01:00:00+08:00";
it("keeps rental billing, agency-chosen driver units and refundable deposits separate", () => {
  expect(rentalEstimate(pricing, start, end, "WITH_DRIVER")).toMatchObject({
    rentalUnits: 1,
    driverUnits: 1,
    vehicleCentavos: 200000,
    driverCentavos: 50000,
    serviceCentavos: 250000,
    refundableDepositCentavos: 300000,
    estimatedDueCentavos: 550000,
  });
  expect(
    rentalEstimate(
      { ...pricing, driverFeeUnit: "PER_HOUR" },
      start,
      end,
      "WITH_DRIVER",
    ).driverCentavos,
  ).toBe(100000);
  expect(
    rentalEstimate(
      { ...pricing, driverFeeUnit: "PER_CALENDAR_DAY" },
      start,
      end,
      "WITH_DRIVER",
    ).driverCentavos,
  ).toBe(100000);
  expect(
    rentalEstimate(
      {
        ...pricing,
        billingUnit: "CALENDAR_DAY",
        driverFeeUnit: "PER_RENTAL_UNIT",
      },
      start,
      end,
      "WITH_DRIVER",
    ),
  ).toMatchObject({ rentalUnits: 2, driverUnits: 2 });
  expect(rentalEstimate(pricing, start, end, "SELF_DRIVE").driverCentavos).toBe(
    0,
  );
});
it("uses half-open Manila calendar days and rounds elapsed billing units upward", () => {
  expect(
    rentalEstimate(
      { ...pricing, billingUnit: "CALENDAR_DAY" },
      start,
      "2031-01-02T00:00:00+08:00",
      "SELF_DRIVE",
    ).rentalUnits,
  ).toBe(1);
  expect(
    rentalEstimate(
      { ...pricing, billingUnit: "HOUR" },
      start,
      "2031-01-02T00:00:01+08:00",
      "SELF_DRIVE",
    ).rentalUnits,
  ).toBe(2);
  expect(
    rentalEstimate(pricing, start, "2031-01-03T00:00:00+08:00", "SELF_DRIVE")
      .rentalUnits,
  ).toBe(2);
});
it("does not guess missing legacy driver units or accept invalid money/windows", () => {
  expect(() =>
    rentalEstimate(
      { ...pricing, driverFeeUnit: null },
      start,
      end,
      "WITH_DRIVER",
    ),
  ).toThrow();
  expect(() => rentalEstimate(pricing, end, start, "SELF_DRIVE")).toThrow();
  expect(() =>
    rentalEstimate({ ...pricing, rateCentavos: 1.5 }, start, end, "SELF_DRIVE"),
  ).toThrow();
  expect(() =>
    rentalEstimate(
      { ...pricing, rateCentavos: 100000000 },
      start,
      end,
      "SELF_DRIVE",
    ),
  ).toThrow();
});
