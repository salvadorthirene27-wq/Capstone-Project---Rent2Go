import { notFound, redirect } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { pageActor } from "@/lib/page-actor";
import { getApplication } from "@/modules/partners/service";
import { uuid } from "@/lib/http";
import { Review } from "./review";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await pageActor();
  if (actor.role !== "SUPER_ADMIN") redirect("/workspace");
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const app = await getApplication(actor, id);
  return (
    <Workspace actor={actor}>
      <Review initial={app} />
    </Workspace>
  );
}
