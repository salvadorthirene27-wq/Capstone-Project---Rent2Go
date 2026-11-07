import {requireActor} from '@/lib/auth';
import {apiError,json,requireOrigin,readJson} from '@/lib/http';
import {rateLimit} from '@/lib/rate-limit';
import {accountRequest} from '@/modules/accounting/http';
import {getOwnerAccount,changeOwnerAccount} from '@/modules/accounting/owner-accounts';
type Context={params:Promise<{agencyId:string;ownerId:string}>};
export async function GET(req:Request,ctx:Context){try{const actor=await requireActor(),{scope,query}=accountRequest(req,await ctx.params);return json(await getOwnerAccount(actor,scope,query));}catch(e){return apiError(e);}}
export async function PATCH(req:Request,ctx:Context){try{requireOrigin(req);const actor=await requireActor();await rateLimit(`${actor.id}:owner-withdrawals`,40);const {scope}=accountRequest(req,await ctx.params,true);return json(await changeOwnerAccount(actor,scope,await readJson(req)));}catch(e){return apiError(e);}}
