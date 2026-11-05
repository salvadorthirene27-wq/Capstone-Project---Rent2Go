import { requireActor } from "@/lib/auth";
import { apiError,json,readJson,requireOrigin,uuid } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { getPayments,changePayment } from "@/modules/bookings/payment";
export async function GET(_:Request,ctx:{params:Promise<{id:string}>}){try{return json(await getPayments(await requireActor(),uuid.parse((await ctx.params).id)));}catch(e){return apiError(e);}}
export async function PATCH(req:Request,ctx:{params:Promise<{id:string}>}){try{requireOrigin(req);const actor=await requireActor();await rateLimit(`${actor.id}:booking-payments`,30);return json(await changePayment(actor,uuid.parse((await ctx.params).id),await readJson(req)));}catch(e){return apiError(e);}}
