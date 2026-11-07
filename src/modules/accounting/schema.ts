import {z} from 'zod';
import {uuid,versionSchema} from '../../lib/http';
import {normalizePaymentReference} from '../bookings/payment-schema';
export const environmentSchema=z.enum(['MANUAL','DEMO']);
export const accountScope=z.object({agencyId:uuid,ownerId:z.string().min(1).max(160),environment:environmentSchema}).strict();
export type AccountScope=z.infer<typeof accountScope>;
const text=z.string().trim().min(1).max(2000),base={version:versionSchema,idempotencyKey:uuid},withdrawal={withdrawalId:uuid};
export const payoutReference=z.string().trim().min(1).max(160).refine(s=>!/[\u0000-\u001f\u007f]/u.test(s)&&normalizePaymentReference(s).length<=160);
const destination=z.object({name:z.string().trim().min(1).max(160),account:z.string().trim().max(200)}).strict();
export const withdrawalCommand=z.discriminatedUnion('action',[
 z.object({...base,action:z.literal('REQUEST_WITHDRAWAL'),amountCentavos:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),method:z.enum(['CASH','GCASH','DEMO_GCASH','DEMO_PAYPAL']),destination,reason:text}).strict().refine(c=>c.method==='CASH'||c.destination.account.length>0,{message:'Enter the payout destination.'}),
 z.object({...base,...withdrawal,action:z.literal('REVIEW_WITHDRAWAL'),decision:z.enum(['APPROVE','REJECT']),reason:text}).strict(),
 z.object({...base,...withdrawal,action:z.literal('WITHDRAW_REQUEST'),reason:text}).strict(),
 z.object({...base,...withdrawal,action:z.literal('REVOKE_APPROVAL'),reason:text}).strict(),
 z.object({...base,...withdrawal,action:z.literal('SIMULATE_PAYOUT'),outcome:z.enum(['SUCCEEDED','FAILED','PENDING','CANCELLED']),reason:text}).strict(),
 z.object({...base,...withdrawal,action:z.literal('RESOLVE_PAYOUT'),attemptId:uuid,outcome:z.enum(['SUCCEEDED','FAILED','CANCELLED']),reason:text}).strict(),
]);
export const payoutEvidenceCommand=z.object({...base,...withdrawal,reference:payoutReference,reason:text,externalPaid:z.literal(true)}).strict();
export const accountQuery=z.object({environment:environmentSchema,page:z.coerce.number().int().min(1).max(10000).default(1),ledgerPage:z.coerce.number().int().min(1).max(10000).default(1)}).strict();
