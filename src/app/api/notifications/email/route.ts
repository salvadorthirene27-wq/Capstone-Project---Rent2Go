import {auth,requireActor} from '@/lib/auth';
import {apiError,json,readJson,requireOrigin} from '@/lib/http';
import {rateLimit} from '@/lib/rate-limit';
import {DomainError} from '@/modules/partners/workflow';
import {changeEmailSettings,getEmailSettings} from '@/modules/email/service';
async function identity(){const {data,error}=await auth.getSession();if(error||!data?.user)throw new DomainError('Sign in to continue.',401);return {id:data.user.id,email:data.user.email,emailVerified:data.user.emailVerified};}
export async function GET(req:Request){try{
 const actor=await requireActor();await rateLimit(`${actor.id}:email-settings`,40);const p=new URL(req.url).searchParams;for(const key of p.keys())if(p.getAll(key).length!==1)throw new DomainError('Send each filter once.',422);
 return json(await getEmailSettings(actor,await identity(),Object.fromEntries(p)));
}catch(e){return apiError(e);}}
export async function POST(req:Request){try{
 requireOrigin(req);const actor=await requireActor();await rateLimit(`${actor.id}:email-settings-change`,10);return json(await changeEmailSettings(actor,await identity(),await readJson(req)));
}catch(e){return apiError(e);}}
