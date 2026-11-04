import { Workspace } from "@/components/workspace";
import { CreateVehicle } from "@/components/vehicles/create-vehicle";
import { pageActor } from "@/lib/page-actor";
import { requireAgencyAccess } from "@/modules/agencies/service";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await pageActor(),
    agency = await requireAgencyAccess(actor, (await params).id);
  return (
    <Workspace actor={actor}>
      <CreateVehicle ownership="AGENCY_OWNED" agency={agency} />
    </Workspace>
  );
}
