import {requireActor} from "@/lib/auth";
import {apiError,json,readJson,requireOrigin,uuid} from "@/lib/http";
import {rateLimit} from "@/lib/rate-limit";
import {DomainError} from "@/modules/partners/workflow";
import {getOwnerAllocations,reviewOwnerAllocation} from "@/modules/bookings/owner-allocation";
type Context={params:Promise<{id:string}>};
export async function GET(req:Request,ctx:Context){try{
 const actor=await requireActor(),q=new URL(req.url).searchParams;
 for(const key of q.keys())if(q.getAll(key).length!==1)throw new DomainError("Send each owner-review query once.",422);
 return json(await getOwnerAllocations(actor,uuid.parse((await ctx.params).id),Object.fromEntries(q)));
}catch(e){return apiError(e);}}
export async function PATCH(req:Request,ctx:Context){try{
 requireOrigin(req);const actor=await requireActor();await rateLimit(`${actor.id}:owner-allocations`,40);
 return json(await reviewOwnerAllocation(actor,uuid.parse((await ctx.params).id),await readJson(req)));
}catch(e){return apiError(e);}}
