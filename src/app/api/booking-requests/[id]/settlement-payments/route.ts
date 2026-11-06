import {requireActor} from '@/lib/auth';
import {apiError,json,readJson,requireOrigin,uuid} from '@/lib/http';
import {rateLimit} from '@/lib/rate-limit';
import {DomainError} from '@/modules/partners/workflow';
import {getSettlementPayments,changeSettlementPayment} from '@/modules/bookings/settlement-payment';
type Context={params:Promise<{id:string}>};
export async function GET(req:Request,ctx:Context){try{const actor=await requireActor(),q=new URL(req.url).searchParams;for(const k of q.keys())if(q.getAll(k).length!==1)throw new DomainError('Send each balance-payment page once.',422);return json(await getSettlementPayments(actor,uuid.parse((await ctx.params).id),Object.fromEntries(q)));}catch(e){return apiError(e);}}
export async function PATCH(req:Request,ctx:Context){try{requireOrigin(req);const actor=await requireActor();await rateLimit(`${actor.id}:settlement-payments`,40);return json(await changeSettlementPayment(actor,uuid.parse((await ctx.params).id),await readJson(req)));}catch(e){return apiError(e);}}
