import { redirect } from "next/navigation";
import { pageActor } from "@/lib/page-actor";
import { myAgencies } from "@/modules/agencies/service";

export const dynamic = "force-dynamic";

export default async function WorkspaceStart() {
  const actor = await pageActor();

  if (actor.role === "SUPER_ADMIN") redirect("/admin");

  if (actor.role === "AGENCY_ADMIN") {
    const agencies = await myAgencies(actor);
    if (agencies.length === 1) redirect(`/agency/${agencies[0].id}`);
  }

  // The workspace lists active memberships for accounts with multiple agencies.
  redirect("/workspace");
}
