import {requireActor} from '@/lib/auth';
import {apiError,json,readJson,requireOrigin,uuid} from '@/lib/http';
import {rateLimit} from '@/lib/rate-limit';
import {getClosedCredit,changeClosedCreditById} from '@/modules/accounting/closed-credits';
type Context={params:Promise<{id:string}>};
export async function GET(_req:Request,ctx:Context){try{return json(await getClosedCredit(await requireActor(),uuid.parse((await ctx.params).id)));}catch(e){return apiError(e);}}
export async function PATCH(req:Request,ctx:Context){try{requireOrigin(req);const actor=await requireActor();await rateLimit(`${actor.id}:closed-credit-review`,30);const id=uuid.parse((await ctx.params).id);await changeClosedCreditById(actor,id,await readJson(req));return json(await getClosedCredit(actor,id));}catch(e){return apiError(e);}}
