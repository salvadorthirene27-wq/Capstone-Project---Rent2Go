import {requireActor} from '@/lib/auth';
import {apiError} from '@/lib/http';
import {loadFile} from '@/lib/storage';
import {ownerPayoutFile} from '@/modules/accounting/owner-accounts';
export async function GET(_:Request,ctx:{params:Promise<{id:string}>}){try{const actor=await requireActor(),f=await ownerPayoutFile(actor,(await ctx.params).id);return new Response(await loadFile(f.objectKey,f.backend),{headers:{'Content-Type':f.mime,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});}catch(e){return apiError(e);}}
