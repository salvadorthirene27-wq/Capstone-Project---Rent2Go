import {requireActor} from '@/lib/auth';
import {apiError,json} from '@/lib/http';
import {rateLimit} from '@/lib/rate-limit';
import {getUnreadNotificationCount} from '@/modules/notifications/service';
import {DomainError} from '@/modules/partners/workflow';
export async function GET(req:Request){try{
 const actor=await requireActor();await rateLimit(`${actor.id}:notification-count`,60);
 if(new URL(req.url).search)throw new DomainError('Notification counts use your signed-in account.',422);
 return json(await getUnreadNotificationCount(actor));
}catch(e){return apiError(e);}}
