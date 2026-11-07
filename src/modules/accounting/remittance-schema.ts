import {z} from 'zod';
import {uuid,versionSchema} from '../../lib/http';
const hash=z.string().regex(/^[a-f0-9]{64}$/),reason=z.string().trim().min(1).max(2000),cents=z.number().int().positive().max(Number.MAX_SAFE_INTEGER),page=z.coerce.number().int().min(1).max(10000);
export const remittanceEnvironment=z.enum(['MANUAL','DEMO']);
export const remittanceScope=z.object({agencyId:uuid,environment:remittanceEnvironment}).strict();
export type RemittanceScope=z.infer<typeof remittanceScope>;
export const remittanceQuery=z.object({environment:remittanceEnvironment.default('MANUAL'),sourcePage:page.default(1),creditPage:page.default(1),historyPage:page.default(1),creditHistoryPage:page.default(1)}).strict();
const base={version:versionSchema,idempotencyKey:uuid},exact={remittanceId:uuid,digest:hash};
export const remittanceCommand=z.discriminatedUnion('action',[
 z.object({...base,action:z.literal('REQUEST_REMITTANCE'),sourcePage:page,sourceDigest:hash,amountCentavos:cents,method:z.enum(['CASH','GCASH','DEMO_CARD','DEMO_GCASH','DEMO_PAYPAL']),reason,consent:z.literal(true)}).strict(),
 z.object({...base,...exact,action:z.literal('WITHDRAW_REMITTANCE'),reason}).strict(),
 z.object({...base,...exact,action:z.literal('REVOKE_REMITTANCE'),reason}).strict(),
 z.object({...base,...exact,action:z.literal('SIMULATE_REMITTANCE'),outcome:z.enum(['APPROVED','PENDING','DECLINED','CANCELLED'])}).strict(),
 z.object({...base,...exact,action:z.literal('RESOLVE_REMITTANCE'),attemptId:uuid,outcome:z.enum(['APPROVED','DECLINED','CANCELLED']),reason}).strict(),
 z.object({...base,...exact,action:z.literal('REVIEW_REMITTANCE'),attemptId:uuid,decision:z.enum(['ACCEPT','REJECT']),externalReceived:z.boolean(),reason}).strict().refine(v=>v.externalReceived===(v.decision==='ACCEPT'),{path:['externalReceived'],message:'Confirm actual receipt only when accepting the exact payment claim.'}),
 z.object({...base,action:z.literal('ACCEPT_AGENCY_CREDIT'),entryId:uuid,creditDigest:hash,consent:z.literal(true)}).strict(),
 z.object({...base,action:z.literal('APPLY_AGENCY_CREDIT'),sourcePage:page,sourceDigest:hash,creditDigest:hash,amountCentavos:cents,consent:z.literal(true)}).strict()
]);
export const remittanceEvidenceCommand=z.object({...base,...exact,action:z.literal('SUBMIT_REMITTANCE_PROOF'),reference:z.string().trim().min(3).max(160),note:reason,externalPaid:z.literal(true)}).strict();
export type RemittanceCommand=z.infer<typeof remittanceCommand>;
export type RemittanceEvidenceCommand=z.infer<typeof remittanceEvidenceCommand>;
export const agencyCreditConsent='I accept this exact excess as an agency credit for future Rent2Go remittances in the same agency and payment environment. This is not a cash refund. The original remittance record remains unchanged. Applying this credit will be recorded separately from a new payment.';
