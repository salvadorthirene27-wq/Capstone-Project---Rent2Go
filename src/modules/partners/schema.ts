import { z } from "zod";
import { driverFeeUnitSchema } from "../pricing/units";
import {extraChargePolicyList,completeExtraChargePolicy} from "./extra-charges";

export const serviceOptions = [
  "SELF_DRIVE",
  "WITH_DRIVER",
  "GROUP_TOUR",
  "PRIVATE_TOUR",
] as const;
export const paymentOptions = [
  "CASH",
  "GCASH",
  "DEMO_CARD",
  "DEMO_GCASH",
  "DEMO_PAYPAL",
] as const;
const text = z.string().trim().max(8000);
const short = z.string().trim().max(200);
const cents = z.number().int().min(0).max(100_000_000).nullable();
const bps = z.number().int().min(0).max(10000);
export const draftApplicationSchema = z
  .object({
    businessName: short,
    legalName: short,
    representative: short,
    email: short,
    phone: short,
    address: text,
    serviceAreas: text,
    registrationNumber: short,
    supportContact: short,
    services: z.array(z.enum(serviceOptions)).max(4),
    eligibilityTerms: text,
    terms: text,
    cancellationPolicy: text,
    refundPolicy: text,
    damagePolicy: text,
    latePolicy: text,
    billingUnit: z.enum(["24_HOUR", "CALENDAR_DAY", "HOUR"]),
    dailyRateCentavos: cents,
    depositCentavos: cents,
    driverFeeCentavos: cents,
    driverFeeUnit: driverFeeUnitSchema.nullable().default(null),
    perPersonCentavos: cents,
    perPartyCentavos: cents,
    holdHours: z.number().int().min(1).max(168).nullable(),
    bufferMinutes: z.number().int().min(0).max(1440).nullable(),
    inclusions: text,
    exclusions: text,
    // PAYMONGO is an explicit new approved policy choice, never a silent
    // reinterpretation of a previous DEMO_* or manual GCash agreement.
    acceptedMethods: z.array(z.enum([...paymentOptions,"PAYMONGO"])).max(6),
    gcashAccountName: short,
    gcashInstructions: text,
    platformPaymentMethod: z.enum(["DEMO_CARD", "DEMO_GCASH", "DEMO_PAYPAL"]),
    settlementSchedule: z.enum(["PER_BOOKING", "WEEKLY", "MONTHLY"]),
    split: z
      .object({ cosigner: bps, agency: bps, platform: bps, maintenance: bps })
      .strict(),
    consent: z.boolean(),
    extraChargePolicies:extraChargePolicyList.optional(),
  })
  .strict();
export type ApplicationInput = z.infer<typeof draftApplicationSchema>;
export const defaultApplication: ApplicationInput = {
  businessName: "",
  legalName: "",
  representative: "",
  email: "",
  phone: "",
  address: "",
  serviceAreas: "",
  registrationNumber: "",
  supportContact: "",
  services: [],
  eligibilityTerms: "",
  terms: "",
  cancellationPolicy: "",
  refundPolicy: "",
  damagePolicy: "",
  latePolicy: "",
  billingUnit: "24_HOUR",
  dailyRateCentavos: null,
  depositCentavos: null,
  driverFeeCentavos: null,
  driverFeeUnit: null,
  perPersonCentavos: null,
  perPartyCentavos: null,
  holdHours: null,
  bufferMinutes: null,
  inclusions: "",
  exclusions: "",
  acceptedMethods: [],
  gcashAccountName: "",
  gcashInstructions: "",
  platformPaymentMethod: "DEMO_GCASH",
  settlementSchedule: "WEEKLY",
  split: { cosigner: 7000, agency: 1000, platform: 1000, maintenance: 1000 },
  consent: false,
};
export const completeApplicationSchema = draftApplicationSchema.superRefine(
  (v, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: path.split("."), message });
    for (const key of [
      "businessName",
      "legalName",
      "representative",
      "email",
      "phone",
      "address",
      "serviceAreas",
      "registrationNumber",
      "supportContact",
      "eligibilityTerms",
      "terms",
      "cancellationPolicy",
      "refundPolicy",
      "damagePolicy",
      "latePolicy",
      "inclusions",
      "exclusions",
    ] as const) {
      if (!v[key]) issue(key, "Complete this field before submitting.");
    }
    if (!z.email().safeParse(v.email).success)
      issue("email", "Enter a valid business email.");
    if (!/^[+\d()\s-]{7,30}$/.test(v.phone))
      issue("phone", "Enter a valid contact number.");
    if (!v.services.length) issue("services", "Select at least one service.");
    if (!v.acceptedMethods.length)
      issue("acceptedMethods", "Select at least one renter payment method.");
    if (v.acceptedMethods.includes("GCASH")) {
      if (!v.gcashAccountName)
        issue(
          "gcashAccountName",
          "Enter the business-owned GCash account name.",
        );
      if (!v.gcashInstructions)
        issue("gcashInstructions", "Explain how receipts will be verified.");
    }
    if (Object.values(v.split).reduce((a, b) => a + b, 0) !== 10000)
      issue("split", "Revenue shares must total exactly 100%.");
    const rental = v.services.some(
      (s) => s === "SELF_DRIVE" || s === "WITH_DRIVER",
    );
    const extraKeys=new Set<string>();
    for(const [index,p]of(v.extraChargePolicies??[]).entries()){
      const key=`${p.type}:${p.context}`;
      if(extraKeys.has(key))ctx.addIssue({code:"custom",path:["extraChargePolicies",index],message:"Configure each charge type and service context only once."});
      extraKeys.add(key);
      const valid=completeExtraChargePolicy.safeParse(p);
      if(!valid.success)for(const e of valid.error.issues)ctx.addIssue({code:"custom",path:["extraChargePolicies",index,...e.path],message:e.message});
      if(p.context==="TOUR_ONLY"?!v.services.some(s=>s==="GROUP_TOUR"||s==="PRIVATE_TOUR"):!rental)ctx.addIssue({code:"custom",path:["extraChargePolicies",index,"context"],message:"This charge context requires a matching selected service."});
    }
    if (rental) {
      if (!v.dailyRateCentavos)
        issue("dailyRateCentavos", "Enter a positive base rental rate.");
      if (v.depositCentavos === null)
        issue("depositCentavos", "Set a deposit, or explicitly enter zero.");
      if (v.bufferMinutes === null)
        issue(
          "bufferMinutes",
          "Set the turnaround time, including zero if applicable.",
        );
    }
    if (v.services.includes("WITH_DRIVER") && v.driverFeeCentavos === null)
      issue(
        "driverFeeCentavos",
        "Set the driver charge, including zero if included.",
      );
    if (v.services.includes("WITH_DRIVER") && v.driverFeeUnit === null)
      issue("driverFeeUnit", "Choose how the driver charge is billed.");
    if (v.services.includes("GROUP_TOUR") && !v.perPersonCentavos)
      issue("perPersonCentavos", "Enter the starting per-person tour rate.");
    if (v.services.includes("PRIVATE_TOUR") && !v.perPartyCentavos)
      issue("perPartyCentavos", "Enter the starting private-party tour rate.");
    if (v.holdHours === null)
      issue("holdHours", "Set the quotation hold period.");
    if (!v.consent)
      issue("consent", "Confirm your authority and consent before submitting.");
  },
);
