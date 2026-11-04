import Link from "next/link";
import { Workspace } from "@/components/workspace";
import { ResourceList } from "@/components/resources/resource-list";
import { pageActor } from "@/lib/page-actor";
import { pageAgency } from "@/lib/page-agency";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const actor = await pageActor(),
    agency = await pageAgency(actor, (await params).id),
    q = await searchParams,
    page = Math.min(10000, Math.max(1, parseInt(q.page ?? "1", 10) || 1));
  return (
    <Workspace actor={actor}>
      <Link className="back-link" href={`/agency/${agency.id}`}>
        Agency workspace
      </Link>
      <div className="page-title">
        <div>
          <h1>{agency.name} calendars</h1>
          <p>
            Coordinate vehicle and driver time, record maintenance and resolve
            conflicts before assigning a service.
          </p>
        </div>
        <Link
          className="button"
          href={`/agency/${agency.id}/resources/drivers/new`}
        >
          Add a driver
        </Link>
      </div>
      <ResourceList
        actor={actor}
        scope="AGENCY"
        agencyId={agency.id}
        page={page}
        basePath={`/agency/${agency.id}/resources`}
      />
    </Workspace>
  );
}
