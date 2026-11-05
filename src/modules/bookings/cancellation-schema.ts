import {z} from "zod";
import {uuid,versionSchema} from "../../lib/http";
const reason=z.string().trim().min(1).max(2000),base={version:versionSchema,idempotencyKey:uuid},exact={cancellationId:uuid,digest:z.string().regex(/^[a-f0-9]{64}$/)};
export const cancellationCommand=z.discriminatedUnion("action",[
 z.object({...base,action:z.literal("REQUEST_CANCELLATION"),reason}).strict(),
 z.object({...base,...exact,action:z.literal("WITHDRAW_CANCELLATION"),reason}).strict(),
 z.object({...base,...exact,action:z.literal("REVIEW_CANCELLATION"),decision:z.enum(["APPROVE","REJECT"]),reason}).strict(),
]);
export function canCancelStatus(status:string){return ["REQUIREMENTS_PENDING","UNDER_REVIEW","CHANGES_REQUESTED","READY_FOR_APPROVAL","QUOTE_PENDING","QUOTE_ACCEPTED","QUOTE_DECLINED","HOLD_EXPIRED","AGREEMENT_PENDING","AGREEMENT_SIGNED","PAYMENT_PARTIAL","READY_FOR_SERVICE","PAYMENT_RECONCILIATION_REQUIRED"].includes(status);}
