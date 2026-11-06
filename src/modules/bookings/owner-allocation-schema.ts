import {z} from "zod";
import {uuid,versionSchema} from "../../lib/http";
export const ownerAllocationQuery=z.object({scope:z.enum(["OPEN","HISTORY"]).default("OPEN"),page:z.coerce.number().int().min(1).max(10000).default(1)}).strict();
export const ownerAllocationCommand=z.object({
 action:z.literal("REVIEW_OWNER_ALLOCATION"),version:versionSchema,idempotencyKey:uuid,
 assessmentId:uuid,digest:z.string().regex(/^[a-f0-9]{64}$/),
 decision:z.enum(["ACCEPT","DISPUTE"]),consent:z.boolean(),reason:z.string().trim().max(2000),
}).strict().superRefine((v,c)=>{
 if(v.decision==='ACCEPT'&&!v.consent)c.addIssue({code:'custom',path:['consent'],message:'Explicitly accept this exact vehicle allocation.'});
 if(v.decision==='DISPUTE'&&(v.consent||!v.reason))c.addIssue({code:'custom',path:['reason'],message:'Explain the disputed allocation without recording consent.'});
});
