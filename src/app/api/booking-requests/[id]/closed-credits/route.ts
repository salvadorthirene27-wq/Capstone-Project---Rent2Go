import {requireActor} from '@/lib/auth';
import {apiError,json,readJson,requireOrigin,uuid} from '@/lib/http';
import {rateLimit} from '@/lib/rate-limit';
import {DomainError} from '@/modules/partners/workflow';
import {getClosedCredits,changeClosedCredit} from '@/modules/accounting/closed-credits';
type Context={params:Promise<{id:string}>};
export async function GET(req:Request,ctx:Context){try{const actor=await requireActor(),q=new URL(req.url).searchParams;for(const k of q.keys())if(q.getAll(k).length!==1)throw new DomainError('Send each credit page once.',422);return json(await getClosedCredits(actor,uuid.parse((await ctx.params).id),Object.fromEntries(q)));}catch(e){return apiError(e);}}
export async function PATCH(req:Request,ctx:Context){try{requireOrigin(req);const actor=await requireActor();await rateLimit(`${actor.id}:closed-credits`,30);const id=uuid.parse((await ctx.params).id);await changeClosedCredit(actor,id,await readJson(req));return json(await getClosedCredits(actor,id));}catch(e){return apiError(e);}}
