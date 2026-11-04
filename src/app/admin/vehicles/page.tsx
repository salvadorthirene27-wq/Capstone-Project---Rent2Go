import { redirect } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { VehicleQueue } from "@/components/vehicles/vehicle-queue";
import { pageActor } from "@/lib/page-actor";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const actor = await pageActor();
  if (actor.role !== "SUPER_ADMIN") redirect("/workspace");
  const q = await searchParams,
    page = Math.min(10000, Math.max(1, parseInt(q.page ?? "1", 10) || 1));
  return (
    <Workspace actor={actor}>
      <h1>Vehicle compliance reviews</h1>
      <p>
        Review ownership evidence, vehicle details and the accepted agreement.
        Owners and active operators cannot approve their own inventory.
      </p>
      <VehicleQueue
        actor={actor}
        scope="COMPLIANCE"
        page={page}
        basePath="/admin/vehicles"
      />
    </Workspace>
  );
}
