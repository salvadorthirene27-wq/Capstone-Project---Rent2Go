import {z} from 'zod';
import {uuid,versionSchema} from '../../lib/http';
const message=z.string().trim().min(5).max(3000),base={idempotencyKey:uuid},hash=z.string().regex(/^[a-f0-9]{64}$/);
export const privacyQuery=z.object({page:z.coerce.number().int().min(1).max(10000).default(1),view:z.enum(['OPEN','ALL']).default('OPEN')}).strict();
export const privacyCreate=z.object({...base,kind:z.enum(['ACCESS','CORRECTION','REMOVAL','DEACTIVATION','REACTIVATION']),message,requestedName:z.string().trim().min(2).max(120).optional(),acknowledged:z.literal(true)}).strict().refine(v=>(v.kind==='CORRECTION')===(v.requestedName!==undefined),{path:['requestedName'],message:'Supply the exact requested display name only for a correction.'});
export const privacyAction=z.object({...base,version:versionSchema,digest:hash,action:z.enum(['REQUEST_INFO','REPLY','APPROVE','REJECT','WITHDRAW']),message,acknowledged:z.literal(true)}).strict();
