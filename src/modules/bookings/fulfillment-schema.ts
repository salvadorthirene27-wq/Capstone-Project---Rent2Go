import {z} from "zod";
import {uuid,versionSchema} from "../../lib/http";
export const inspectionPhase=z.enum(["PRE","POST"]);
export const inspectionBody=z.object({odometerKm:z.number().int().min(0).max(10_000_000),fuelEighths:z.number().int().min(0).max(8),cleanliness:z.enum(["CLEAN","NEEDS_CLEANING"]),damageNotes:z.string().trim().min(1).max(4000),roadworthy:z.boolean(),safetyChecked:z.boolean(),photoIds:z.array(uuid).min(1).max(8).refine(v=>new Set(v).size===v.length)}).strict();
const base={version:versionSchema,idempotencyKey:uuid,lineId:uuid};
export const fulfillmentCommand=z.discriminatedUnion("action",[
 z.object({...base,action:z.literal("RECORD_INSPECTION"),phase:inspectionPhase,condition:inspectionBody}).strict(),
 z.object({...base,action:z.literal("ACK_INSPECTION"),inspectionId:uuid,digest:z.string().regex(/^[a-f0-9]{64}$/),decision:z.enum(["ACCEPT","DISPUTE"]),reason:z.string().trim().max(2000)}).strict().refine(v=>v.decision!=="DISPUTE"||Boolean(v.reason),{message:"Explain the inspection dispute.",path:["reason"]}),
 z.object({...base,action:z.literal("RELEASE_RENTAL"),inspectionId:uuid,digest:z.string().regex(/^[a-f0-9]{64}$/),renterIdsVerified:z.literal(true).optional()}).strict(),
 z.object({...base,action:z.literal("START_TOUR"),attendance:z.number().int().min(1).max(1000),note:z.string().trim().min(1).max(2000)}).strict(),
 z.object({...base,action:z.literal("COMPLETE_TOUR"),note:z.string().trim().min(1).max(2000)}).strict(),
]);
export type InspectionCondition=z.infer<typeof inspectionBody>;
export function fulfillmentStage(kind:string,action:string|null,postDecision:string|null){
 if(kind==="TOUR")return action==="COMPLETE_TOUR"?"TOUR_COMPLETED":action==="START_TOUR"?"TOUR_ACTIVE":"NOT_STARTED";
 if(action==="RECORD_RETURN")return postDecision==="ACCEPT"?"RETURNED":postDecision==="DISPUTE"?"RETURN_DISPUTED":"RETURN_REVIEW";
 return action==="RELEASE_RENTAL"?"RENTAL_ACTIVE":"NOT_STARTED";
}
