import Link from "next/link";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { ResourceEditor } from "@/components/resources/resource-editor";
import { pageActor } from "@/lib/page-actor";
import { resourceDetail,resourceActualStatus } from "@/modules/resources/service";
import {date} from "@/modules/partners/presentation";
import { DomainError } from "@/modules/partners/workflow";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const actor = await pageActor(),
    q = await searchParams,
    page = Math.min(10000, Math.max(1, parseInt(q.page ?? "1", 10) || 1)),
    detail = await resourceDetail(actor, (await params).id, page).catch((e) => {
      if (e instanceof DomainError && e.status === 404) notFound();
      throw e;
    });
  const actual=await resourceActualStatus(actor,detail.id);
  return (
    <Workspace actor={actor}>
      <Link
        className="back-link"
        href={
          detail.capabilities.operates
            ? `/agency/${detail.agencyId}/resources`
            : "/workspace/resources"
        }
      >
        Back to calendars
      </Link>
      <p>
        Operating agency: {detail.agencyName}
        {detail.vehicleOfferId && (
          <>
            {" "}
            ·{" "}
            <Link href={`/workspace/vehicles/${detail.vehicleOfferId}`}>
              Vehicle and agreement
            </Link>
          </>
        )}
      </p>
      {actual.active&&<p className="notice">{actual.overdue?"Overdue return":"Currently in service"}. Actual occupancy remains active until return is recorded. Scheduled end: {date(actual.plannedEnd!)} (Philippine time).{actual.upcomingConflictCount>0&&<> Review {actual.upcomingConflictCount} upcoming booked intervals for a return conflict.</>}</p>}
      {actual.turnaround&&<p className="notice">Return recorded. Turnaround continues until {date(actual.availableAfter!)} (Philippine time).</p>}
      {actual.safetyHold&&<p className="notice">Vehicle safety hold: resolve the return condition and obtain acceptance of a corrected inspection before reuse.</p>}
      <ResourceEditor
        key={`${detail.id}:${detail.total}:${detail.page}:${detail.driver?.version ?? 0}:${detail.occupations.map((o) => `${o.id}:${o.cancelled_at}:${o.maintenance_version}`).join("|")}`}
        initial={detail}
      />
      {detail.pageCount > 1 && (
        <nav className="pagination" aria-label="Calendar history pages">
          {detail.page > 1 && (
            <Link href={`?page=${detail.page - 1}`}>Previous</Link>
          )}
          <span>
            Page {detail.page} of {detail.pageCount}
          </span>
          {detail.page < detail.pageCount && (
            <Link href={`?page=${detail.page + 1}`}>Next</Link>
          )}
        </nav>
      )}
    </Workspace>
  );
}
