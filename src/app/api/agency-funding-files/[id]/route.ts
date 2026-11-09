import {requireActor} from '@/lib/auth';
import {apiError} from '@/lib/http';
import {loadFile} from '@/lib/storage';
import {fundingFile} from '@/modules/gateway/funding';
export async function GET(_:Request,ctx:{params:Promise<{id:string}>}){try{const f=await fundingFile(await requireActor(),(await ctx.params).id);return new Response(await loadFile(f.objectKey,f.backend),{headers:{'Content-Type':f.mime,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});}catch(e){return apiError(e);}}
