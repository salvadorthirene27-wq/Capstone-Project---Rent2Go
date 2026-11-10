import { z } from "zod";
const instant = z.iso
  .datetime({ offset: true })
  .refine(
    (v) => !v.match(/\.(\d{4,})/),
    "Use times with at most millisecond precision.",
  )
  .transform((v) => new Date(v).toISOString());
export const vehicleSearchSchema = z
  .object({
    id: z.uuid().optional(),
    agencyId: z.uuid().optional(),
    search: z.string().trim().max(120).default(""),
    serviceArea: z.string().trim().max(120).default(""),
    mode: z.enum(["SELF_DRIVE", "WITH_DRIVER"]).optional(),
    partySize: z.coerce.number().int().min(1).max(50).optional(),
    transmission: z.enum(["AUTOMATIC", "MANUAL"]).optional(),
    preferredTransmission: z.enum(["AUTOMATIC", "MANUAL"]).optional(),
    fuel: z.enum(["GASOLINE", "DIESEL", "HYBRID", "ELECTRIC"]).optional(),
    bodyType: z
      .enum(["SEDAN", "HATCHBACK", "SUV", "MPV", "VAN", "PICKUP", "OTHER"])
      .optional(),
    billingUnit: z.enum(["12_HOUR", "24_HOUR", "CALENDAR_DAY", "HOUR"]).optional(),
    minRateCentavos: z.coerce.number().int().min(0).max(100000000).optional(),
    maxRateCentavos: z.coerce.number().int().min(1).max(100000000).optional(),
    budgetCentavos: z.coerce.number().int().min(1).max(100000000).optional(),
    startAt: instant.optional(),
    endAt: instant.optional(),
    sort: z
      .enum(["RECOMMENDED", "NAME", "PRICE_ASC", "PRICE_DESC"])
      .default("RECOMMENDED"),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(12),
  })
  .strict()
  .superRefine((v, c) => {
    if (Boolean(v.startAt) !== Boolean(v.endAt))
      c.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "Provide both pickup and return times.",
      });
    if (
      v.startAt &&
      v.endAt &&
      (Date.parse(v.endAt) <= Date.parse(v.startAt) ||
        Date.parse(v.startAt) < Date.now())
    )
      c.addIssue({
        code: "custom",
        path: ["startAt"],
        message: "Choose a future pickup and a later return.",
      });
    if (v.minRateCentavos !== undefined && v.maxRateCentavos !== undefined && v.minRateCentavos > v.maxRateCentavos)
      c.addIssue({
        code: "custom",
        path: ["maxRateCentavos"],
        message: "Maximum rate must be at least the minimum rate.",
      });
    if (v.budgetCentavos && !v.startAt)
      c.addIssue({
        code: "custom",
        path: ["budgetCentavos"],
        message: "Set dates to compare the service estimate with your budget.",
      });
  });
