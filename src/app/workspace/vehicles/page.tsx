import Link from "next/link";
import { Workspace } from "@/components/workspace";
import { VehicleQueue } from "@/components/vehicles/vehicle-queue";
import { pageActor } from "@/lib/page-actor";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; state?: string }>;
}) {
  const actor = await pageActor(),
    p = await searchParams,
    page = Math.min(10000, Math.max(1, parseInt(p.page ?? "1", 10) || 1));
  return (
    <Workspace actor={actor}>
      <div className="page-title">
        <div>
          <h1>My personal vehicles</h1>
          <p>
            Offer your car to an approved agency and review the agreement before
            accepting.
          </p>
        </div>
        <Link className="button" href="/workspace/vehicles/new">
          Offer a car
        </Link>
      </div>
      <VehicleQueue
        actor={actor}
        scope="OWNED"
        page={page}
        state={p.state}
        basePath="/workspace/vehicles"
      />
    </Workspace>
  );
}
