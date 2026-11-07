import {z} from 'zod';
import {auth} from '@/lib/auth';
import {apiError,json,readJson,requireOrigin} from '@/lib/http';
import {rateLimit} from '@/lib/rate-limit';
import {accountIdentity} from '@/modules/account/service';
import {DomainError} from '@/modules/partners/workflow';
const command=z.discriminatedUnion('action',[
 z.object({action:z.literal('SEND_VERIFICATION')}).strict(),
 z.object({action:z.literal('VERIFY_EMAIL'),code:z.string().regex(/^\d{6}$/)}).strict(),
]);
export async function GET(req:Request){try{
 if(new URL(req.url).search)throw new DomainError('Account filters are not supported.',422);
 const account=await accountIdentity();await rateLimit(`${account.id}:account-read`,40);return json(account);
}catch(e){return apiError(e);}}
export async function POST(req:Request){try{
 requireOrigin(req);const input=command.parse(await readJson(req)),account=await accountIdentity();
 await rateLimit(`${account.id}:account-${input.action}`,input.action==='SEND_VERIFICATION'?2:5);
 if(account.emailVerified)return json({account,message:'Your email is already verified.'});
 if(input.action==='SEND_VERIFICATION'){
  const result=await auth.emailOtp.sendVerificationOtp({email:account.email,type:'email-verification'});
  if(result.error)throw new DomainError('Unable to request a code right now. Wait and try again.',502);
  return json({account,message:'A verification code was requested for your account email. Check your Inbox and Spam.'});
 }
 const result=await auth.emailOtp.verifyEmail({email:account.email,otp:input.code});
 if(result.error||!result.data?.user?.emailVerified)throw new DomainError('Unable to verify this code. It may be incorrect or expired. Request a new code if needed.',422);
 if(result.data.user.id!==account.id||result.data.user.email.toLowerCase()!==account.email.toLowerCase())throw new DomainError('Account identity changed. Sign in again.',409);
 return json({account:{...account,emailVerified:true},message:'Your account email is verified. You can now enable email updates.'});
}catch(e){return apiError(e);}}
