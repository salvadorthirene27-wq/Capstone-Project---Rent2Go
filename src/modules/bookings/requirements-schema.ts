import { z } from "zod";
import { DomainError } from "../partners/workflow";
export const purposeSchema = z.enum(["IDENTITY", "DRIVER_LICENSE"]);
export type Purpose = z.infer<typeof purposeSchema>;
export const expirySchema = z.iso.date();
export const requirementsCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("SUBMIT"), version: z.number().int().positive()
  }).strict(),
  z.object({
    action: z.literal("START_REVIEW"), version: z.number().int().positive()
  }).strict(),
  z.object({
    action: z.literal("COMPLETE_REVIEW"), version: z.number().int().positive()
  }).strict(),
  z.object({
    action: z.literal("REJECT"), version: z.number().int().positive(), reason: z.string().trim().min(1).max(2000)
  }).strict(),
  z.object({
    action: z.literal("REVIEW_DOCUMENT"), version: z.number().int().positive(), fileId: z.uuid(), decision: z.enum(["ACCEPTED", "CHANGES_REQUESTED"]), reason: z.string().trim().max(2000).optional()
  }).strict().refine(v => v.decision !== "CHANGES_REQUESTED" || !!v.reason, {
    message: "Explain the correction required."
  })
]);
export function requiredPurposes(quotes: {
  selection: {
    kind: string;
    mode?: string;
  };
}[]): Purpose[] {
  return quotes.some(q => q.selection.kind === "RENTAL" && q.selection.mode === "SELF_DRIVE") ? ["IDENTITY", "DRIVER_LICENSE"] : ["IDENTITY"];
}
export function validateExpiry(purpose: Purpose, expiry: string | null, end: string) {
  if (expiry !== null && !expirySchema.safeParse(expiry).success)
    throw new DomainError("Enter a valid expiry date.");
  if (purpose === "DRIVER_LICENSE" && !expiry)
    throw new DomainError("A driver license expiry covering the service end is required.");
  if (expiry && expiry < end)
    throw new DomainError("The document expires before the service ends.");
}
export function serviceEndDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date(value));
}
