import {privacyIdentity} from '@/modules/governance/identity';
import {getPrivacyCase,changePrivacyCase} from '@/modules/governance/privacy';
import {apiError,json,readJson,requireOrigin} from '@/lib/http';
import {rateLimit} from '@/lib/rate-limit';
type Context={params:Promise<{id:string}>};
export async function GET(_req:Request,ctx:Context){try{const u=await privacyIdentity();await rateLimit(`${u.id}:privacy-reads`,50);return json(await getPrivacyCase(u,(await ctx.params).id));}catch(e){return apiError(e);}}
export async function PATCH(req:Request,ctx:Context){try{requireOrigin(req);const u=await privacyIdentity();await rateLimit(`${u.id}:privacy-actions`,20);return json(await changePrivacyCase(u,(await ctx.params).id,await readJson(req)));}catch(e){return apiError(e);}}
