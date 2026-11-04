import { z } from "zod";
export const windowSchema = z
  .object({
    startAt: z.iso.datetime({ offset: true }),
    endAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      !Number.isFinite(Date.parse(v.startAt)) ||
      !Number.isFinite(Date.parse(v.endAt)) ||
      Date.parse(v.endAt) <= Date.parse(v.startAt)
    )
      c.addIssue({
        code: "custom",
        path: ["endAt"],
        message:
          "End time must be later than start time. Include the time zone.",
      });
  });
export const blockSchema = z
  .object({
    startAt: z.iso.datetime({ offset: true }),
    endAt: z.iso.datetime({ offset: true }),
    kind: z.enum(["UNAVAILABLE", "MAINTENANCE"]),
    note: z.string().trim().min(10).max(2000),
  })
  .strict()
  .superRefine((v, c) => {
    if (Date.parse(v.endAt) <= Date.parse(v.startAt))
      c.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "End time must be later than start time.",
      });
  });
export const driverSchema = z
  .object({
    agencyId: z.uuid(),
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(7).max(32),
    licenseNumber: z
      .string()
      .trim()
      .min(3)
      .max(80)
      .regex(/^[A-Za-z0-9 -]+$/)
      .refine(
        (v) => v.replace(/[ -]/g, "").length >= 3,
        "Enter a valid license identifier.",
      ),
    licenseExpiry: z.iso.date(),
    active: z.boolean().default(true),
  })
  .strict();
export const driverPatchSchema = driverSchema
  .omit({ agencyId: true })
  .extend({ active: z.boolean() })
  .partial()
  .strict();
export const resourceListSchema = z
  .object({
    scope: z.enum(["OWNED", "AGENCY"]).default("OWNED"),
    agencyId: z.uuid().optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(48).default(12),
  })
  .strict();
