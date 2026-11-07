import {z} from 'zod';
import {uuid,versionSchema} from '../../lib/http';
const common={version:versionSchema,idempotencyKey:uuid};
export const ocrCommand=z.discriminatedUnion('action',[
 z.object({...common,action:z.literal('EXTRACT'),consent:z.literal(true),policyVersion:z.literal('ocr-space-v1')}).strict(),
 z.object({...common,action:z.literal('REVOKE'),consentId:uuid}).strict(),
 z.object({...common,action:z.literal('COMPARE'),jobId:uuid,digest:z.string().regex(/^[a-f0-9]{64}$/),decision:z.enum(['COMPARED','UNUSABLE']),note:z.string().trim().max(2000).default(''),acknowledged:z.literal(true)}).strict().refine(v=>v.decision!=='UNUSABLE'||v.note.length>=5,'Explain why manual assessment is required.'),
 z.object({...common,action:z.literal('CLOSE_STALLED'),jobId:uuid,acknowledged:z.literal(true)}).strict(),
]);
export const ocrQuery=z.object({jobId:uuid.optional()}).strict();
