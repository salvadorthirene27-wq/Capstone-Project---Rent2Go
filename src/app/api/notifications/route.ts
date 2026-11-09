import {requireActor} from '@/lib/auth';
import {apiError,json,readJson,requireOrigin} from '@/lib/http';
import {rateLimit} from '@/lib/rate-limit';
import {DomainError} from '@/modules/partners/workflow';
import {getInbox,markNotificationsRead,changeNotifications} from '@/modules/notifications/service';
export async function GET(req:Request){try{
 const actor=await requireActor();await rateLimit(`${actor.id}:inbox-reads`,60);const p=new URL(req.url).searchParams;for(const key of p.keys())if(p.getAll(key).length!==1)throw new DomainError('Send each inbox filter once.',422);return json(await getInbox(actor,Object.fromEntries(p)));
}catch(e){return apiError(e);}}
export async function PATCH(req:Request){try{
 requireOrigin(req);const actor=await requireActor();await rateLimit(`${actor.id}:inbox-read-receipts`,40);const body=await readJson(req);return json(await (body&&typeof body==='object'&&'action' in body?changeNotifications(actor,body):markNotificationsRead(actor,body)));
}catch(e){return apiError(e);}}
