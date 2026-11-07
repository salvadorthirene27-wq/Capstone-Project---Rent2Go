import {Workspace} from '@/components/workspace';
import {Inbox} from '@/components/notification-inbox';
import {pageActor} from '@/lib/page-actor';
import {getInbox} from '@/modules/notifications/service';
export const dynamic='force-dynamic';
export default async function Page(){const actor=await pageActor();return <Workspace actor={actor}><Inbox initial={await getInbox(actor)}/></Workspace>;}
