import { z } from "zod";
const instant = z.iso
  .datetime({ offset: true })
  .refine(
    (v) => !/\.\d{4,}/.test(v),
    "Use times with at most millisecond precision.",
  )
  .transform((v) => new Date(v).toISOString());
export const selectionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("RENTAL"),
      offerId: z.uuid(),
      startAt: instant,
      endAt: instant,
      mode: z.enum(["SELF_DRIVE", "WITH_DRIVER"]),
      partySize: z.number().int().min(1).max(50),
    })
    .strict(),
  z
    .object({
      kind: z.literal("TOUR"),
      tourId: z.uuid(),
      scheduleId: z.uuid(),
      partySize: z.number().int().min(1).max(500),
    })
    .strict(),
]);
export const cartCommandSchema = z
  .object({
    selection: selectionSchema,
    quoteDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type Selection = z.infer<typeof selectionSchema>;
