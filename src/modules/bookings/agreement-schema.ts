import { z } from "zod";
import { uuid, versionSchema } from "../../lib/http";
import { digest } from "../cart/pricing";
import { DomainError } from "../partners/workflow";
export const AGREEMENT_TEMPLATE_VERSION = "rent2go-electronic-agreement-v1";
export const AGREEMENT_ACKNOWLEDGEMENT = "I have read this exact agreement and the accepted quotation, including service dates, guests, charges, refundable deposits and policies. I consent to signing this agreement electronically using my typed full name and submitted signature image. This records my consent; it does not certify handwriting authenticity. Payment and fulfillment remain pending, and this signature does not extend the quotation hold.";
const exact = { version: versionSchema, digest: z.string().regex(/^[a-f0-9]{64}$/) };
export const agreementCommand = z.discriminatedUnion("action",[
 z.object({action:z.literal("ISSUE_AGREEMENT"),...exact,quoteId:uuid}).strict(),
 z.object({action:z.literal("WITHDRAW_AGREEMENT"),...exact,agreementId:uuid,reason:z.string().trim().min(1).max(2000)}).strict(),
]);
export const signatureCommand = z.object({...exact,agreementId:uuid,signerName:z.string().trim().min(1).max(160),consent:z.literal(true)}).strict();
export const agreementDigest=digest;
const service=z.object({lineId:uuid,title:z.string(),kind:z.enum(["RENTAL","TOUR"]),startAt:z.string(),endAt:z.string(),partySize:z.number().int().positive(),serviceCentavos:z.number().int().nonnegative(),refundableDepositCentavos:z.number().int().nonnegative(),driverName:z.string().nullable()});
const policy=z.object({lineId:uuid,terms:z.string(),cancellationPolicy:z.string(),refundPolicy:z.string(),damagePolicy:z.string(),latePolicy:z.string()});
const acceptedSnapshot=z.object({lines:z.array(service).min(1),totals:z.object({serviceCentavos:z.number().int().nonnegative(),refundableDepositCentavos:z.number().int().nonnegative(),totalCentavos:z.number().int().nonnegative()}),policies:z.array(policy).min(1)});
export function agreementBody(agencyName:string,renterName:string,snapshot:unknown){
 const q=acceptedSnapshot.parse(snapshot);
 return {agencyName,renterName,services:q.lines,totals:q.totals,policies:q.policies,acknowledgement:AGREEMENT_ACKNOWLEDGEMENT};
}
export type AgreementBody=ReturnType<typeof agreementBody>;
export function validateSignerName(typed:string,saved:string){
 const normalize=(s:string)=>s.normalize("NFKC").trim().replace(/\s+/gu," ").toLocaleLowerCase("en-US");
 if(!normalize(saved)||normalize(typed)!==normalize(saved))throw new DomainError("Enter the full signer name shown in this agreement.",422);
}
export function validateSignatureImage(bytes:Uint8Array,declared:string){
 if(!bytes.length||bytes.length>1024*1024)throw new DomainError("Signature image must be between 1 byte and 1 MB.",413);
 const b=Buffer.from(bytes),actual=b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?"image/png":b[0]===255&&b[1]===216&&b[2]===255?"image/jpeg":null;
 if(!actual||actual!==declared)throw new DomainError("Choose a PNG or JPEG signature image with matching file content.",422);
 return actual;
}
