import {requireActor} from '@/lib/auth';
import {apiError,json,readJson,requireOrigin} from '@/lib/http';
import {rateLimit} from '@/lib/rate-limit';
import {getGovernanceUser,changeGovernanceUser} from '@/modules/governance/users';
type Context={params:Promise<{id:string}>};
export async function GET(_req:Request,ctx:Context){try{const u=await requireActor();await rateLimit(`${u.id}:user-governance-read`,40);return json(await getGovernanceUser(u,(await ctx.params).id));}catch(e){return apiError(e);}}
export async function PATCH(req:Request,ctx:Context){try{requireOrigin(req);const u=await requireActor();await rateLimit(`${u.id}:user-governance-write`,15);return json(await changeGovernanceUser(u,(await ctx.params).id,await readJson(req)));}catch(e){return apiError(e);}}
