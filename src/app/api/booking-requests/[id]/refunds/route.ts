import {requireActor} from "@/lib/auth";
import {apiError,json,readJson,requireOrigin,uuid} from "@/lib/http";
import {rateLimit} from "@/lib/rate-limit";
import {DomainError} from "@/modules/partners/workflow";
import {getRefunds,changeRefund} from "@/modules/bookings/refund";
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){try{const actor=await requireActor(),query=new URL(req.url).searchParams;for(const key of query.keys())if(query.getAll(key).length!==1)throw new DomainError("Send each refund page once.",422);return json(await getRefunds(actor,uuid.parse((await ctx.params).id),Object.fromEntries(query)));}catch(e){return apiError(e);}}
export async function PATCH(req:Request,ctx:{params:Promise<{id:string}>}){try{requireOrigin(req);const actor=await requireActor();await rateLimit(`${actor.id}:booking-refunds`,40);return json(await changeRefund(actor,uuid.parse((await ctx.params).id),await readJson(req)));}catch(e){return apiError(e);}}
