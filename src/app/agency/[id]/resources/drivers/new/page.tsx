import { Workspace } from "@/components/workspace";
import { DriverCreate } from "@/components/resources/driver-create";
import { pageActor } from "@/lib/page-actor";
import { pageAgency } from "@/lib/page-agency";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await pageActor(),
    agency = await pageAgency(actor, (await params).id);
  return (
    <Workspace actor={actor}>
      <DriverCreate agencyId={agency.id} />
    </Workspace>
  );
}
