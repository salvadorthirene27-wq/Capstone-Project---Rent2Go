import {requireActor} from "@/lib/auth";
import {apiError,json,readJson,requireOrigin,uuid} from "@/lib/http";
import {rateLimit} from "@/lib/rate-limit";
import {getCancellation,changeCancellation} from "@/modules/bookings/cancellation";
export async function GET(_:Request,ctx:{params:Promise<{id:string}>}){try{return json(await getCancellation(await requireActor(),uuid.parse((await ctx.params).id)));}catch(e){return apiError(e);}}
export async function PATCH(req:Request,ctx:{params:Promise<{id:string}>}){try{requireOrigin(req);const actor=await requireActor();await rateLimit(`${actor.id}:booking-cancellation`,20);return json(await changeCancellation(actor,uuid.parse((await ctx.params).id),await readJson(req)));}catch(e){return apiError(e);}}
