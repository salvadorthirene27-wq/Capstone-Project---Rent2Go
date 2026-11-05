import {requireActor} from "@/lib/auth";
import {apiError,json,readJson,requireOrigin,uuid} from "@/lib/http";
import {rateLimit} from "@/lib/rate-limit";
import {getFulfillment,changeFulfillment} from "@/modules/bookings/fulfillment";
export async function GET(_:Request,ctx:{params:Promise<{id:string}>}){try{return json(await getFulfillment(await requireActor(),uuid.parse((await ctx.params).id)));}catch(e){return apiError(e);}}
export async function PATCH(req:Request,ctx:{params:Promise<{id:string}>}){try{requireOrigin(req);const actor=await requireActor();await rateLimit(`${actor.id}:booking-fulfillment`,40);return json(await changeFulfillment(actor,uuid.parse((await ctx.params).id),await readJson(req)));}catch(e){return apiError(e);}}
