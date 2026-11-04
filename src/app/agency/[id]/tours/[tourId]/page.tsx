import Link from "next/link";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { TourEditor } from "@/components/tours/tour-editor";
import { pageActor } from "@/lib/page-actor";
import { pageAgency } from "@/lib/page-agency";
import { tourDetail } from "@/modules/tours/service";
import { DomainError } from "@/modules/partners/workflow";
import type { TourInput } from "@/modules/tours/schema";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; tourId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const actor = await pageActor(),
    p = await params,
    agency = await pageAgency(actor, p.id),
    page = Math.min(
      10000,
      Math.max(1, parseInt((await searchParams).page ?? "1", 10) || 1),
    ),
    detail = await tourDetail(actor, p.tourId, page).catch((e) => {
      if (e instanceof DomainError && [403, 404].includes(e.status)) notFound();
      throw e;
    });
  if (detail.agencyId !== agency.id) notFound();
  const modes: TourInput["mode"][] = [];
  if (agency.policy.services.includes("GROUP_TOUR")) modes.push("GROUP");
  if (agency.policy.services.includes("PRIVATE_TOUR")) modes.push("PRIVATE");
  if (!modes.includes(detail.payload.mode)) modes.push(detail.payload.mode);
  return (
    <Workspace actor={actor}>
      <Link className="back-link" href={`/agency/${agency.id}/tours`}>
        Tour packages
      </Link>
      {detail.state === "PUBLISHED" && (
        <p>
          <Link href={`/tours/${detail.id}`}>View public package</Link>
        </p>
      )}
      <TourEditor
        key={`${detail.id}:${detail.version}:${detail.scheduleTotal}:${detail.page}:${detail.schedules.map((s) => `${s.id}:${s.status}`).join("|")}`}
        initial={detail}
        agencyId={agency.id}
        defaults={detail.payload}
        modes={modes}
      />
      {detail.pageCount > 1 && (
        <nav className="pagination" aria-label="Departure history pages">
          {page > 1 && <Link href={`?page=${page - 1}`}>Previous</Link>}
          <span>
            Page {page} of {detail.pageCount}
          </span>
          {page < detail.pageCount && (
            <Link href={`?page=${page + 1}`}>Next</Link>
          )}
        </nav>
      )}
    </Workspace>
  );
}
