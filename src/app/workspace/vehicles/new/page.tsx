import { Workspace } from "@/components/workspace";
import { CreateVehicle } from "@/components/vehicles/create-vehicle";
import { pageActor } from "@/lib/page-actor";
import { publicAgencies, publicAgency } from "@/modules/agencies/service";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ agency?: string }>;
}) {
  const actor = await pageActor(),
    q = await searchParams;
  const agency = q.agency
    ? await publicAgency(q.agency).catch(() => undefined)
    : undefined;
  const available = (await publicAgencies({ pageSize: 48 })).items.filter((a) =>
    a.services.some((s) => s === "SELF_DRIVE" || s === "WITH_DRIVER"),
  );
  return (
    <Workspace actor={actor}>
      <CreateVehicle
        ownership="CONSIGNED"
        agency={agency}
        initialAgencies={available}
      />
    </Workspace>
  );
}
