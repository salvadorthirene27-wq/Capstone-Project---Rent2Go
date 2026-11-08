import {requireActor} from '@/lib/auth';
import {apiError,json} from '@/lib/http';
import {rateLimit} from '@/lib/rate-limit';
import {getPaymentReconciliation} from '@/modules/gateway/reconciliation';
import {DomainError} from '@/modules/partners/workflow';
export async function GET(req:Request){try{
 const actor=await requireActor();await rateLimit(`${actor.id}:payment-reconciliation`,60);const query=new URL(req.url).searchParams;
 if(new Set(query.keys()).size!==Array.from(query.keys()).length)throw new DomainError('Use each payment filter once.',422);
 return json(await getPaymentReconciliation(actor,Object.fromEntries(query)));
}catch(e){return apiError(e);}}
