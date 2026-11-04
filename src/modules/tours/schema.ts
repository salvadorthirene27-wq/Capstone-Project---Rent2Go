import { z } from "zod";
import { DomainError } from "../partners/workflow";
const prose = z.string().trim().min(10).max(8000);
export const tourSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    mode: z.enum(["GROUP", "PRIVATE"]),
    description: prose,
    serviceArea: z.string().trim().min(2).max(300),
    meetingPoint: z.string().trim().min(5).max(2000),
    itinerary: z
      .array(
        z
          .object({
            title: z.string().trim().min(2).max(160),
            description: prose,
          })
          .strict(),
      )
      .min(1)
      .max(30),
    inclusions: z.string().trim().min(1).max(4000),
    exclusions: z.string().trim().min(1).max(4000),
    eligibilityTerms: prose,
    terms: prose,
    cancellationPolicy: prose,
    refundPolicy: prose,
    priceCentavos: z.number().int().min(1).max(100000000),
    minParty: z.number().int().min(1).max(500),
    maxParty: z.number().int().min(1).max(500),
    transportIncluded: z.boolean(),
    fulfillment: z.literal("TOUR_ONLY"),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.minParty > v.maxParty)
      c.addIssue({
        code: "custom",
        path: ["maxParty"],
        message: "Maximum party size must accommodate the minimum.",
      });
  });
export type TourInput = z.infer<typeof tourSchema>;
export const tourSearchSchema = z
  .object({
    search: z.string().trim().max(120).default(""),
    agencyId: z.uuid().optional(),
    mode: z.enum(["GROUP", "PRIVATE"]).optional(),
    partySize: z.coerce.number().int().min(1).max(500).optional(),
    maxPriceCentavos: z.coerce.number().int().min(1).max(100000000).optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(48).default(12),
    sort: z.enum(["NAME", "PRICE_ASC", "PRICE_DESC"]).default("NAME"),
  })
  .strict();
export const scheduleSchema = z
  .object({
    startAt: z.iso.datetime({ offset: true }),
    endAt: z.iso.datetime({ offset: true }),
    cutoffAt: z.iso.datetime({ offset: true }),
    capacity: z.number().int().min(1).max(5000),
  })
  .strict()
  .superRefine((v, c) => {
    if (Date.parse(v.endAt) <= Date.parse(v.startAt))
      c.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "End must follow start.",
      });
    if (Date.parse(v.cutoffAt) >= Date.parse(v.startAt))
      c.addIssue({
        code: "custom",
        path: ["cutoffAt"],
        message: "Booking cutoff must be before departure.",
      });
  });
export function tourPrice(input: unknown, partySize: number) {
  const tour = tourSchema.parse(input);
  if (
    !Number.isInteger(partySize) ||
    partySize < tour.minParty ||
    partySize > tour.maxParty
  )
    throw new DomainError(
      `Party size must be a whole number from ${tour.minParty} to ${tour.maxParty}.`,
    );
  const quantity = tour.mode === "GROUP" ? partySize : 1,
    totalCentavos = tour.priceCentavos * quantity;
  if (!Number.isSafeInteger(totalCentavos) || totalCentavos > 100000000)
    throw new DomainError("This party exceeds the supported quotation amount.");
  return {
    unit:
      tour.mode === "GROUP" ? ("PER_PERSON" as const) : ("PER_PARTY" as const),
    quantity,
    totalCentavos,
  };
}
