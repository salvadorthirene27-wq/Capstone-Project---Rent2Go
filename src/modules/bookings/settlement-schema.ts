import {z} from 'zod';
import {uuid,versionSchema} from '../../lib/http';
const base={version:versionSchema,idempotencyKey:uuid},exact={settlementId:uuid,digest:z.string().regex(/^[a-f0-9]{64}$/)},reason=z.string().trim().min(1).max(2000);
export const settlementCommand=z.discriminatedUnion('action',[
 z.object({...base,action:z.literal('PROPOSE_SETTLEMENT'),reason}).strict(),
 z.object({...base,...exact,action:z.literal('DECIDE_SETTLEMENT'),decision:z.enum(['ACCEPT','DISPUTE']),consent:z.boolean(),reason:z.string().trim().max(2000)}).strict().superRefine((v,c)=>{if(v.decision==='ACCEPT'&&!v.consent)c.addIssue({code:'custom',path:['consent'],message:'Accept this exact settlement.'});if(v.decision==='DISPUTE'&&(v.consent||!v.reason))c.addIssue({code:'custom',path:['reason'],message:'Explain the dispute without recording consent.'});}),
 z.object({...base,...exact,action:z.literal('WITHDRAW_SETTLEMENT'),reason}).strict(),
 z.object({...base,...exact,action:z.literal('CLOSE_FINANCIAL_RECORD'),reason}).strict(),
]);
export const settlementQuery=z.object({page:z.coerce.number().int().min(1).max(10000).default(1)}).strict();
