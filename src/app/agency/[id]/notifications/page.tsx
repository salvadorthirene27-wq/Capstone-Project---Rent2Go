import { NotificationPanel } from "@/components/notification-panel";
import { Workspace } from "@/components/workspace";
import { pageActor } from "@/lib/page-actor";
import { pageAgency } from "@/lib/page-agency";
import { getInbox } from "@/modules/notifications/service";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const actor = await pageActor();
  await pageAgency(actor, (await params).id);
  const inbox = await getInbox(actor);
  return <Workspace actor={actor}><NotificationPanel initial={inbox}/></Workspace>;
}
