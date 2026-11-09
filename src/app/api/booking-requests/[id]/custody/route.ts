import {requireActor} from '@/lib/auth';
import {apiError,json,uuid} from '@/lib/http';
import {rateLimit} from '@/lib/rate-limit';
import {getCentralCustody} from '@/modules/gateway/custody';
import {DomainError} from '@/modules/partners/workflow';
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){try{
 const actor=await requireActor();await rateLimit(`${actor.id}:central-custody`,60);
 if(new URL(req.url).search)throw new DomainError('This account does not accept client-supplied financial totals or filters.',422);
 return json(await getCentralCustody(actor,uuid.parse((await ctx.params).id)));
}catch(e){return apiError(e);}}
