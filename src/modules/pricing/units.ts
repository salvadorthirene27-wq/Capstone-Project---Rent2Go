import { z } from "zod";
export const driverFeeUnitSchema = z.enum([
  "PER_BOOKING",
  "PER_24_HOURS",
  "PER_CALENDAR_DAY",
  "PER_HOUR",
  "PER_RENTAL_UNIT",
]);
export const driverFeeUnitLabels: Record<
  z.infer<typeof driverFeeUnitSchema>,
  string
> = {
  PER_BOOKING: "Once per booking",
  PER_24_HOURS: "Per 24 hours",
  PER_CALENDAR_DAY: "Per calendar day (Manila)",
  PER_HOUR: "Per hour",
  PER_RENTAL_UNIT: "Per vehicle billing unit",
};
