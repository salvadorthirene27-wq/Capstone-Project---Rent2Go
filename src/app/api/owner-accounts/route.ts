import {requireActor} from '@/lib/auth';
import {apiError,json} from '@/lib/http';
import {DomainError} from '@/modules/partners/workflow';
import {getOwnerAccounts} from '@/modules/accounting/owner-accounts';
export async function GET(req:Request){try{const actor=await requireActor(),p=new URL(req.url).searchParams;for(const key of p.keys())if(p.getAll(key).length!==1)throw new DomainError('Send each account filter once.',422);return json(await getOwnerAccounts(actor,Object.fromEntries(p)));}catch(e){return apiError(e);}}
