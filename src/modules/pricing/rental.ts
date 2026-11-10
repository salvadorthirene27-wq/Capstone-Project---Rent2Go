import { z } from "zod";
import { driverFeeUnitSchema } from "./units";
import { windowSchema } from "../resources/schema";
import { DomainError } from "../partners/workflow";
const cents = z.number().int().min(0).max(100000000);
const pricingSchema = z.object({
  billingUnit: z.enum(["12_HOUR", "24_HOUR", "CALENDAR_DAY", "HOUR"]),
  rateCentavos: cents.refine((n) => n > 0),
  depositCentavos: cents,
  driverFeeCentavos: cents.nullable(),
  driverFeeUnit: driverFeeUnitSchema.nullable().default(null),
  modes: z.array(z.enum(["SELF_DRIVE", "WITH_DRIVER"])),
});
export function rentalEstimate(
  input: unknown,
  startAt: string,
  endAt: string,
  mode: "SELF_DRIVE" | "WITH_DRIVER",
) {
  const p = pricingSchema.parse(input),
    q = windowSchema.parse({ startAt, endAt }),
    start = Date.parse(q.startAt),
    end = Date.parse(q.endAt),
    duration = end - start;
  if (!p.modes.includes(mode))
    throw new DomainError("This rental mode is not offered.");
  if (p.billingUnit === "12_HOUR" && duration < 43_200_000)
    throw new DomainError("This rental requires at least 12 hours.", 422);
  const calendarDays =
    Math.floor((end - 1 + 28800000) / 86400000) -
    Math.floor((start + 28800000) / 86400000) +
    1;
  const elapsed = (unit: typeof p.billingUnit) =>
    unit === "CALENDAR_DAY"
      ? calendarDays
      : Math.ceil(duration / (unit === "HOUR" ? 3_600_000 : unit === "12_HOUR" ? 43_200_000 : 86_400_000));
  const rentalUnits = elapsed(p.billingUnit);
  let driverUnits = 0;
  if (mode === "WITH_DRIVER") {
    if (p.driverFeeCentavos === null || p.driverFeeUnit === null)
      throw new DomainError(
        "The agency must configure the driver fee and its unit before this rental can be estimated.",
        409,
      );
    driverUnits =
      p.driverFeeUnit === "PER_BOOKING"
        ? 1
        : p.driverFeeUnit === "PER_RENTAL_UNIT"
          ? rentalUnits
          : elapsed(
              p.driverFeeUnit === "PER_HOUR"
                ? "HOUR"
                : p.driverFeeUnit === "PER_CALENDAR_DAY"
                  ? "CALENDAR_DAY"
                  : "24_HOUR",
            );
  }
  const vehicleCentavos = p.rateCentavos * rentalUnits,
    driverCentavos = (p.driverFeeCentavos ?? 0) * driverUnits,
    serviceCentavos = vehicleCentavos + driverCentavos,
    estimatedDueCentavos = serviceCentavos + p.depositCentavos;
  if (
    !Number.isSafeInteger(estimatedDueCentavos) ||
    estimatedDueCentavos > 100000000
  )
    throw new DomainError(
      "This interval exceeds the supported quotation amount.",
    );
  return {
    rentalUnits,
    driverUnits,
    vehicleCentavos,
    driverCentavos,
    serviceCentavos,
    refundableDepositCentavos: p.depositCentavos,
    estimatedDueCentavos,
  };
}
