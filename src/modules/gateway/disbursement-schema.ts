import {z} from 'zod';
const id=z.uuid(),reason=z.string().trim().min(1).max(2000),version=z.number().int().positive();
export const disbursementDestination=z.object({method:z.enum(['BANK','GCASH']),institution:z.string().trim().min(2).max(100),name:z.string().trim().min(2).max(160),account:z.string().trim().min(4).max(80).regex(/^[A-Za-z0-9 +()-]+$/)}).strict();
const base={version,idempotencyKey:id};
const exact={...base,disbursementId:id};
export const disbursementCommand=z.discriminatedUnion('action',[
 z.object({...base,action:z.literal('REQUEST'),sourceDigest:z.string().regex(/^[a-f0-9]{64}$/),destination:disbursementDestination,reason}).strict(),
 z.object({...exact,action:z.enum(['APPROVE','REJECT','WITHDRAW']),reason}).strict(),
 z.object({...exact,action:z.literal('SIMULATE_TRANSFER'),reference:z.string().trim().min(1).max(160),reason}).strict(),
 z.object({...exact,action:z.literal('CONFIRM_RECEIPT'),received:z.literal(true),reason}).strict(),
]);
export const disbursementTransferCommand=z.object({...exact,action:z.literal('RECORD_TRANSFER'),reference:z.string().trim().min(1).max(160),reason,externalPaid:z.literal(true)}).strict();
