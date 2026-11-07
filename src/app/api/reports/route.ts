import {requireActor} from '@/lib/auth';
import {apiError,json} from '@/lib/http';
import {rateLimit} from '@/lib/rate-limit';
import {DomainError} from '@/modules/partners/workflow';
import {reportScope} from '@/modules/reports/schema';
import {getReport} from '@/modules/reports/service';
export async function GET(req:Request){try{
 const actor=await requireActor();await rateLimit(`${actor.id}:financial-report-reads`,60);const p=new URL(req.url).searchParams;for(const key of p.keys())if(p.getAll(key).length!==1)throw new DomainError('Send each report filter once.',422);
 const {scope,agencyId,...filters}=Object.fromEntries(p),spec=reportScope.parse({type:scope,...(agencyId!==undefined?{agencyId}:{})});return json(await getReport(actor,spec,filters));
}catch(e){return apiError(e);}}
