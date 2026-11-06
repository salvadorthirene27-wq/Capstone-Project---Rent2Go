import {z} from "zod";
import {uuid,versionSchema} from "../../lib/http";
import {extraChargeTypes} from "../partners/extra-charges";
const reason=z.string().trim().min(1).max(2000),amount=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const item=z.object({id:uuid,lineId:uuid,amountCentavos:amount,reason}).strict();
const base={version:versionSchema,idempotencyKey:uuid},exact={assessmentId:uuid,digest:z.string().regex(/^[a-f0-9]{64}$/)};
export const assessmentCommand=z.discriminatedUnion("action",[
 z.object({...base,action:z.literal("PROPOSE_ASSESSMENT"),reason,credits:z.array(item).max(40),charges:z.array(item.extend({type:z.enum(extraChargeTypes)}).strict()).max(40)}).strict(),
 z.object({...base,...exact,action:z.literal("DECIDE_ASSESSMENT"),decision:z.enum(["ACCEPT","DISPUTE"]),reason:z.string().trim().max(2000),consent:z.boolean()}).strict().superRefine((v,c)=>{if(v.decision==="ACCEPT"&&!v.consent)c.addIssue({code:"custom",path:["consent"],message:"Explicitly accept this exact itemized assessment."});if(v.decision==="DISPUTE"&&!v.reason)c.addIssue({code:"custom",path:["reason"],message:"Explain the disputed amount or terms."});}),
 z.object({...base,...exact,action:z.literal("WITHDRAW_ASSESSMENT"),reason}).strict(),
]);
export const assessmentQuery=z.object({historyPage:z.coerce.number().int().min(1).max(10000).default(1)}).strict();
