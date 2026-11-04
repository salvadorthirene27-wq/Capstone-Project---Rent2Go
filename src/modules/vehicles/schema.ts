import { z } from "zod";
import { validateVehicleShares, type VehicleOwnership } from "./workflow";
export const vehicleFactsSchema = z
  .object({
    make: z.string().trim().min(1).max(80),
    model: z.string().trim().min(1).max(80),
    year: z.number().int().min(1980).max(2100),
    seats: z.number().int().min(1).max(50),
    transmission: z.enum(["AUTOMATIC", "MANUAL"]),
    fuel: z.enum(["GASOLINE", "DIESEL", "HYBRID", "ELECTRIC"]),
    bodyType: z.enum([
      "SEDAN",
      "HATCHBACK",
      "SUV",
      "MPV",
      "VAN",
      "PICKUP",
      "OTHER",
    ]),
    description: z.string().trim().min(10).max(4000),
    features: z.array(z.string().trim().min(1).max(80)).max(20),
    pickupInstructions: z.string().trim().min(5).max(2000),
  })
  .strict();
export const createVehicleSchema = z
  .object({
    ownership: z.enum(["CONSIGNED", "AGENCY_OWNED"]),
    agencyId: z.uuid(),
    registration: z.string(),
    facts: vehicleFactsSchema,
  })
  .strict();
const cents = z.number().int().min(0).max(100_000_000);
export const vehicleTermsSchema = z
  .object({
    rateCentavos: cents.refine((n) => n > 0, "Enter a positive vehicle rate."),
    depositCentavos: cents,
    billingUnit: z.enum(["24_HOUR", "CALENDAR_DAY", "HOUR"]),
    modes: z
      .array(z.enum(["SELF_DRIVE", "WITH_DRIVER"]))
      .min(1)
      .max(2),
    driverFeeCentavos: cents.nullable(),
    inclusions: z.string().trim().min(1).max(4000),
    exclusions: z.string().trim().min(1).max(4000),
    agreementTerms: z.string().trim().min(10).max(8000),
    shares: z
      .object({
        cosigner: z.number(),
        agency: z.number(),
        platform: z.number(),
        maintenance: z.number(),
      })
      .strict(),
    allocationBasis: z.literal("SERVICE_REVENUE_EXCLUDING_REFUNDABLE_DEPOSIT"),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.modes.includes("WITH_DRIVER") && v.driverFeeCentavos === null)
      c.addIssue({
        code: "custom",
        path: ["driverFeeCentavos"],
        message: "Set the driver charge, including zero when included.",
      });
  });
export type VehicleFacts = z.infer<typeof vehicleFactsSchema>;
export type VehicleTerms = z.infer<typeof vehicleTermsSchema>;
export function validatedTerms(ownership: VehicleOwnership, input: unknown) {
  const terms = vehicleTermsSchema.parse(input);
  return { ...terms, shares: validateVehicleShares(ownership, terms.shares) };
}
export const vehicleActionSchema = z
  .object({
    action: z.enum([
      "SUBMIT",
      "PROPOSE",
      "ACCEPT",
      "APPROVE",
      "PUBLISH",
      "UNPUBLISH",
      "AMEND",
      "REQUEST_CHANGES",
      "REJECT",
    ]),
    version: z.number().int().positive(),
    revision: z.number().int().min(0),
    reason: z.string().trim().max(2000).default(""),
    terms: vehicleTermsSchema.optional(),
  })
  .strict();
