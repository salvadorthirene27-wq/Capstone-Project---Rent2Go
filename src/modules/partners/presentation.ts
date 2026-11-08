import type { ApplicationInput } from "./schema";
export const serviceLabels = {
  SELF_DRIVE: "Self-drive rental",
  WITH_DRIVER: "Rental with driver",
  GROUP_TOUR: "Scheduled group tours",
  PRIVATE_TOUR: "Private tours",
};
export const methodLabels = {
  CASH: "Cash on hand",
  GCASH: "GCash · manual receipt review",
  DEMO_CARD: "Card · simulated",
  DEMO_GCASH: "GCash gateway · simulated",
  DEMO_PAYPAL: "PayPal · simulated",
  PAYMONGO: "Online payment through PayMongo",
};
export const fieldLabels: Partial<Record<keyof ApplicationInput, string>> = {
  businessName: "Trading / agency name",
  legalName: "Registered legal name",
  representative: "Authorized representative",
  email: "Business email",
  phone: "Contact number",
  address: "Operating address",
  serviceAreas: "Service areas",
  registrationNumber: "Business registration number",
  supportContact: "Customer support contact",
  eligibilityTerms: "Eligibility and required documents",
  terms: "Full service terms and conditions",
  cancellationPolicy: "Cancellation policy",
  refundPolicy: "Refund process and conditions",
  damagePolicy: "Damage and deposit handling",
  latePolicy: "Late return and no-show policy",
  inclusions: "Rate inclusions",
  exclusions: "Exclusions and additional charges",
  gcashAccountName: "Business-owned GCash account name",
  gcashInstructions: "GCash payment and receipt-verification instructions",
  dailyRateCentavos: "Base rental rate (PHP)",
  depositCentavos: "Refundable security deposit (PHP)",
  driverFeeCentavos: "Driver charge (PHP)",
  driverFeeUnit: "Driver fee unit",
  perPersonCentavos: "Starting group-tour rate per person (PHP)",
  perPartyCentavos: "Starting private-tour rate per party (PHP)",
  holdHours: "Quote hold period (hours)",
  bufferMinutes: "Vehicle turnaround buffer (minutes)",
};
export const businessFields = [
  "businessName",
  "legalName",
  "representative",
  "email",
  "phone",
  "address",
  "serviceAreas",
  "registrationNumber",
  "supportContact",
] as const;
export const termFields = [
  "eligibilityTerms",
  "terms",
  "cancellationPolicy",
  "refundPolicy",
  "damagePolicy",
  "latePolicy",
] as const;
export const steps = [
  "Business details",
  "Services",
  "Terms & policies",
  "Pricing",
  "Payments & shares",
  "Review & submit",
];
export const statusLabel = (s: string) => s.replaceAll("_", " ").toLowerCase();
export const money = (n: number | null) =>
  n === null
    ? "Not set"
    : new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
      }).format(n / 100);
export const date = (v: string | Date) =>
  new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(v));
