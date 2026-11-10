import {pageActor} from '@/lib/page-actor';
import {Workspace} from '@/components/workspace';
import {NotificationPanel} from '@/components/notification-panel';
import {getInbox} from '@/modules/notifications/service';
export const dynamic='force-dynamic';
export default async function Page(){
 const actor=await pageActor(),inbox=await getInbox(actor);
 return <Workspace actor={actor}><NotificationPanel initial={inbox}/></Workspace>;
}
