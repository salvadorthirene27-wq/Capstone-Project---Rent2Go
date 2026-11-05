import { z } from "zod";
import { uuid,versionSchema } from "../../lib/http";
import { DomainError } from "../partners/workflow";
export const paymentMethod=z.enum(["CASH","GCASH","DEMO_CARD","DEMO_GCASH","DEMO_PAYPAL"]);
const amount=z.number().int().positive().max(Number.MAX_SAFE_INTEGER),reason=z.string().trim().min(1).max(2000),reference=z.string().trim().min(1).max(160).refine(s=>!/[\u0000-\u001f\u007f]/u.test(s)&&normalizePaymentReference(s).length<=160);
const action={version:versionSchema,idempotencyKey:uuid},exact={agreementId:uuid,digest:z.string().regex(/^[a-f0-9]{64}$/)};
export const paymentCommand=z.discriminatedUnion("action",[
 z.object({...action,...exact,action:z.literal("RECORD_CASH"),amountCentavos:amount,reference,note:reason}).strict(),
 z.object({...action,action:z.literal("REVIEW_GCASH"),attemptId:uuid,decision:z.enum(["CONFIRM","REJECT"]),reason}).strict(),
 z.object({...action,...exact,action:z.literal("SIMULATE_PAYMENT"),method:z.enum(["DEMO_CARD","DEMO_GCASH","DEMO_PAYPAL"]),outcome:z.enum(["APPROVED","DECLINED","PENDING","CANCELLED"])}).strict(),
 z.object({...action,action:z.literal("RESOLVE_DEMO"),attemptId:uuid,outcome:z.enum(["APPROVED","DECLINED","CANCELLED"])}).strict(),
]);
export const evidenceCommand=z.object({...action,...exact,amountCentavos:amount,reference}).strict();
export type PaymentCommand=z.infer<typeof paymentCommand>;
export type EvidenceCommand=z.infer<typeof evidenceCommand>;
export function normalizePaymentReference(value:string){return value.normalize("NFKC").trim().replace(/\s+/gu," ").toLocaleUpperCase("en-US");}
export function paymentTotals(value:unknown,confirmed:number){
 const cents=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),q=z.object({serviceCentavos:cents,refundableDepositCentavos:cents,totalCentavos:cents}).parse(value);
 if(!Number.isSafeInteger(confirmed)||confirmed<0||!Number.isSafeInteger(q.serviceCentavos+q.refundableDepositCentavos)||q.serviceCentavos+q.refundableDepositCentavos!==q.totalCentavos)throw new DomainError("Invalid payment totals.",409);
 return {...q,confirmedCentavos:confirmed,balanceCentavos:Math.max(0,q.totalCentavos-confirmed),creditCentavos:Math.max(0,confirmed-q.totalCentavos)};
}
export function validatePaymentEvidence(bytes:Uint8Array,mime:string){
 if(!bytes.length||bytes.length>5*1024*1024)throw new DomainError("Payment evidence must be between 1 byte and 5 MB.",413);
 const b=Buffer.from(bytes),actual=b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?"image/png":b[0]===255&&b[1]===216&&b[2]===255?"image/jpeg":b.subarray(0,5).equals(Buffer.from("%PDF-"))?"application/pdf":null;
 if(!actual||actual!==mime)throw new DomainError("Choose PNG, JPEG or PDF evidence with matching file content.",422);return actual;
}
