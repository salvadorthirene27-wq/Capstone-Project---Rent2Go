import {requireActor} from "@/lib/auth";
import {apiError,json,readJson,requireOrigin,uuid} from "@/lib/http";
import {rateLimit} from "@/lib/rate-limit";
import {DomainError} from "@/modules/partners/workflow";
import {getAssessments,changeAssessment} from "@/modules/bookings/assessment";
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){try{
 const actor=await requireActor(),q=new URL(req.url).searchParams;
 for(const key of q.keys())if(q.getAll(key).length!==1)throw new DomainError("Send each assessment page once.",422);
 return json(await getAssessments(actor,uuid.parse((await ctx.params).id),Object.fromEntries(q)));
}catch(e){return apiError(e);}}
export async function PATCH(req:Request,ctx:{params:Promise<{id:string}>}){try{
 requireOrigin(req);const actor=await requireActor();await rateLimit(`${actor.id}:booking-assessments`,40);
 return json(await changeAssessment(actor,uuid.parse((await ctx.params).id),await readJson(req)));
}catch(e){return apiError(e);}}
