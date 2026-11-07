import {createHash} from 'node:crypto';
import {verifyPassword} from '@better-auth/utils/password';
import {z} from 'zod';
import {auth} from '../../lib/auth';
import {db} from '../../lib/db';
import {boundedBody,requireOrigin} from '../../lib/http';
import {rateLimit} from '../../lib/rate-limit';
import {DomainError} from '../partners/workflow';

const resetInput=z.object({email:z.email().max(254),otp:z.string().regex(/^\d{6}$/),password:z.string().min(12).max(128)}).strict();
const reply=(code:string,message:string,status:number)=>Response.json({code,message},{status,headers:{'Cache-Control':'no-store'}});

export async function guardedPasswordReset(request:Request,forward:()=>Promise<Response>){
 try{
  requireOrigin(request);
  if(!request.headers.get('content-type')?.includes('application/json'))return reply('INVALID_RESET_REQUEST','Send a JSON reset request.',415);
  const input=resetInput.parse(JSON.parse(new TextDecoder().decode(await boundedBody(request.clone(),2048))));
  const target=createHash('sha256').update(input.email.toLowerCase()).digest('hex');
  await rateLimit(`password-reset-policy:${target}`,5);await rateLimit('password-reset-policy:global',30);
  // Establish code possession before looking up any credential. This check does
  // not consume it; the managed reset below independently rechecks/consumes it.
  const checked=await auth.emailOtp.checkVerificationOtp({email:input.email,otp:input.otp,type:'forget-password'});
  if(checked.error||!checked.data?.success)return reply('INVALID_RESET_CODE','Verify your reset code again, or request a new code if it has expired.',422);
  const digest=(await db.query('SELECT rent2go_current_credential_digest($1) digest',[input.email])).rows[0]?.digest as string|null;
  if(digest===undefined)return reply('PASSWORD_POLICY_UNAVAILABLE','Unable to check the new password right now. Try again later.',503);
  if(digest!==null&&digest!==undefined){
   // Fail closed if the managed provider changes its credential format.
   if(!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(digest))return reply('PASSWORD_POLICY_UNAVAILABLE','Unable to check the new password right now. Try again later.',503);
   if(await verifyPassword(digest,input.password))return reply('PASSWORD_REUSE','Choose a new password different from your current password.',422);
  }
  return await forward();
 }catch(error){
  if(error instanceof z.ZodError||error instanceof SyntaxError)return reply('INVALID_RESET_REQUEST','Check your email, six-digit code and new password (12 to 128 characters).',422);
  if(error instanceof DomainError)return reply('RESET_REQUEST_DENIED',error.message,error.status);
  // No input, hash, code, provider response or credential is logged or returned.
  return reply('PASSWORD_POLICY_UNAVAILABLE','Unable to confirm the password update right now. Check your account before retrying.',503);
 }
}

export function unsupportedPasswordMutation(path:string){return ['change-password','set-password','reset-password','admin/set-user-password'].includes(path);}
