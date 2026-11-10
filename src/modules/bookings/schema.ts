import { z } from "zod";
export const checkoutSchema = z
  .object({
    idempotencyKey: z.uuid(),
    cartVersion: z.number().int().positive(),
    items: z
      .array(
        z
          .object({
            id: z.uuid(),
            version: z.number().int().positive(),
            quoteDigest: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .min(1)
      .max(20)
      .refine(
        (items) => new Set(items.map((i) => i.id)).size === items.length,
        "Select each cart item only once.",
      ),
    contact: z
      .object({
        name: z.string().trim().min(2).max(160),
        phone: z
          .string()
          .trim()
          .min(7)
          .max(30)
          .regex(/^[+\d()\s-]+$/),
        notes: z.string().trim().max(4000),
      })
      .strict(),
  })
  .strict();
export const closedBookingStatuses = ["COMPLETED", "CANCELLED", "REJECTED", "QUOTE_DECLINED", "HOLD_EXPIRED"];

export const bookingListSchema = z
  .object({
    agencyId: z.uuid().optional(),
    view: z.enum(["CURRENT", "HISTORY", "COMPLETED", "CANCELLED"]).optional(),
    search: z.string().trim().max(120).optional(),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict();
