import { requireActor } from "@/lib/auth";
import { apiError, json, requireOrigin, readJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { getAgreement, changeAgreement } from "@/modules/bookings/agreement";
type Context={params:Promise<{id:string}>};
export async function GET(_:Request,ctx:Context){
 try{return json(await getAgreement(await requireActor(),(await ctx.params).id));}catch(e){return apiError(e);}
}
export async function PATCH(req:Request,ctx:Context){
 try{requireOrigin(req);const actor=await requireActor();await rateLimit(`${actor.id}:booking-agreement`,40);return json(await changeAgreement(actor,(await ctx.params).id,await readJson(req)));}catch(e){return apiError(e);}
}
