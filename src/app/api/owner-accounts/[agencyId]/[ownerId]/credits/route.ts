import {requireActor} from '@/lib/auth';
import {apiError,json} from '@/lib/http';
import {accountRequest} from '@/modules/accounting/http';
import {accountQuery} from '@/modules/accounting/schema';
import {getOwnerCredits} from '@/modules/accounting/owner-accounts';
type Context={params:Promise<{agencyId:string;ownerId:string}>};
export async function GET(req:Request,ctx:Context){try{const actor=await requireActor(),{scope,query}=accountRequest(req,await ctx.params);return json(await getOwnerCredits(actor,scope,accountQuery.parse(query).page));}catch(e){return apiError(e);}}
