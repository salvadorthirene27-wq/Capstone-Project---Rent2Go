import {z} from "zod";
import {uuid,versionSchema} from "../../lib/http";
import {DomainError} from "../partners/workflow";
const reason=z.string().trim().min(1).max(2000),money=z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),base={version:versionSchema,idempotencyKey:uuid},exact={refundId:uuid,digest:z.string().regex(/^[a-f0-9]{64}$/)};
export const refundCommand=z.discriminatedUnion("action",[
 z.object({...base,action:z.literal("REQUEST_REFUND"),collectionId:uuid,amountCentavos:money,reason}).strict(),
 z.object({...base,...exact,action:z.literal("REVIEW_REFUND"),decision:z.enum(["APPROVE","REJECT"]),reason}).strict(),
 z.object({...base,...exact,action:z.literal("WITHDRAW_REFUND"),reason}).strict(),
 z.object({...base,...exact,action:z.literal("REVOKE_REFUND"),reason}).strict(),
 z.object({...base,...exact,action:z.literal("RECORD_MANUAL_REFUND"),method:z.enum(["CASH","GCASH"]),reference:z.string().trim().min(3).max(160),note:reason,externalPaid:z.literal(true)}).strict(),
 z.object({...base,...exact,action:z.literal("SIMULATE_REFUND"),outcome:z.enum(["APPROVED","DECLINED","PENDING","CANCELLED"])}).strict(),
 z.object({...base,...exact,action:z.literal("RESOLVE_DEMO_REFUND"),attemptId:uuid,outcome:z.enum(["APPROVED","DECLINED","CANCELLED"])}).strict(),
]);
export const refundListQuery=z.object({sourcePage:z.coerce.number().int().min(1).max(10000).default(1),historyPage:z.coerce.number().int().min(1).max(10000).default(1)}).strict();
export function refundCapacity(confirmed:number,reserved:number,paid:number){
 if([confirmed,reserved,paid].some(n=>!Number.isSafeInteger(n)||n<0)||BigInt(reserved)+BigInt(paid)>BigInt(confirmed))throw new DomainError("Refund capacity requires financial review.",409);
 return {confirmedCentavos:confirmed,reservedCentavos:reserved,paidCentavos:paid,availableCentavos:confirmed-reserved-paid};
}
export function refundStage(decision:string|null,cancellation:string|null,paid:boolean,pendingDemo:boolean){return paid?"PAID":cancellation==="REVOKE"?"REVOKED":cancellation==="WITHDRAW"?"WITHDRAWN":decision==="REJECT"?"REJECTED":decision==="APPROVE"?pendingDemo?"DEMO_PENDING":"APPROVED":"PENDING_REVIEW";}
export function refundableStatus(status:string){return ["CANCELLED_RECONCILIATION_PENDING","FULFILLMENT_RECONCILIATION_PENDING","PAYMENT_RECONCILIATION_REQUIRED"].includes(status);}
