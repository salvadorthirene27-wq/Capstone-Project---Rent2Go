import { auth } from "@/lib/auth";
import {guardedPasswordReset,unsupportedPasswordMutation} from '@/modules/account/password-policy';
export const runtime='nodejs';
const handlers=auth.handler();
export const {GET,PUT,DELETE,PATCH}=handlers;
export async function POST(request:Request,context:{params:Promise<{path:string[]}>}){
 const path=(await context.params).path.join('/').replace(/\/+$/,'').toLowerCase();
 if(path==='email-otp/reset-password')return guardedPasswordReset(request,()=>handlers.POST(request,context));
 if(unsupportedPasswordMutation(path))return Response.json({code:'USE_CODE_RECOVERY',message:'Use the code-based Rent2Go password recovery flow.'},{status:403,headers:{'Cache-Control':'no-store'}});
 return handlers.POST(request,context);
}
