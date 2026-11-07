import {requireActor} from '@/lib/auth';
import {apiError,json,readJson,requireOrigin} from '@/lib/http';
import {rateLimit} from '@/lib/rate-limit';
import {remittanceRequest} from '@/modules/accounting/remittance-http';
import {getRemittanceAccount} from '@/modules/accounting/remittances';
import {changeRemittance} from '@/modules/accounting/remittance-actions';
type Context={params:Promise<{agencyId:string}>};
export async function GET(req:Request,ctx:Context){try{const actor=await requireActor();await rateLimit(`${actor.id}:remittance-reads`,80);const {scope,query}=remittanceRequest(req,(await ctx.params).agencyId);return json(await getRemittanceAccount(actor,scope,query));}catch(e){return apiError(e);}}
export async function PATCH(req:Request,ctx:Context){try{requireOrigin(req);const actor=await requireActor();await rateLimit(`${actor.id}:remittance-actions`,40);const {scope}=remittanceRequest(req,(await ctx.params).agencyId,true);return json(await changeRemittance(actor,scope,await readJson(req)));}catch(e){return apiError(e);}}
