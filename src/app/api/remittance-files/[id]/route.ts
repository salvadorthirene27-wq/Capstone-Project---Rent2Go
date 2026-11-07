import {requireActor} from '@/lib/auth';
import {apiError} from '@/lib/http';
import {loadFile} from '@/lib/storage';
import {remittanceEvidenceForRead} from '@/modules/accounting/remittance-records';
export async function GET(_:Request,ctx:{params:Promise<{id:string}>}){try{const file=await remittanceEvidenceForRead(await requireActor(),(await ctx.params).id);return new Response(await loadFile(file.objectKey,file.backend),{headers:{'Content-Type':file.mime,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});}catch(e){return apiError(e);}}
