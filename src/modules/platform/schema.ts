import {z} from 'zod';
const uuid=z.uuid(),versionSchema=z.number().int().positive();
const bps=z.number().int().min(0).max(10000);
export const platformShares=z.object({cosigner:bps.positive(),agency:bps,platform:bps,maintenance:bps}).strict().refine(s=>Object.values(s).reduce((a,b)=>a+b,0)===10000,{message:'Revenue shares must total exactly 100%.'});
export const platformPayload=z.object({
 consignedDefaults:platformShares,
 termsTitle:z.string().trim().min(5).max(160),termsText:z.string().trim().min(100).max(16000),
 inactiveEvidenceReviewDays:z.number().int().min(1).max(36500).nullable(),
 faqs:z.array(z.object({question:z.string().trim().min(8).max(240),answer:z.string().trim().min(20).max(3000)}).strict()).min(1).max(20),
}).strict();
export type PlatformPayload=z.infer<typeof platformPayload>;
export const termsSnapshot=z.object({revision:versionSchema,digest:z.string().regex(/^[a-f0-9]{64}$/),title:z.string(),text:z.string()}).strict();
export type PlatformTerms=z.infer<typeof termsSnapshot>;
export const publishPolicy=z.object({version:versionSchema,digest:z.string().regex(/^[a-f0-9]{64}$/),payload:platformPayload,reason:z.string().trim().min(10).max(3000),acknowledged:z.literal(true),idempotencyKey:uuid}).strict();
export function agencyOwnedShares(s:PlatformPayload['consignedDefaults']){return {cosigner:0,agency:10000-s.platform-s.maintenance,platform:s.platform,maintenance:s.maintenance};}
export function tourShares(s:PlatformPayload['consignedDefaults']){return {cosigner:0,agency:10000-s.platform,platform:s.platform,maintenance:0};}
