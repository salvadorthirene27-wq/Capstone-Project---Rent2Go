import Link from "next/link";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { BookingList } from "@/components/booking-list";
import { pageActor } from "@/lib/page-actor";
import { listBookingRequests } from "@/modules/bookings/service";
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
    { id } = await params,
    { page } = await searchParams,
    list = await listBookingRequests(actor, {
      agencyId: id,
      page: page ?? 1,
    }).catch((e) => {
      if (e instanceof DomainError && [403, 404].includes(e.status)) notFound();
      throw e;
    });
  return (
    <Workspace actor={actor}>
      <Link className="back-link" href={`/agency/${id}`}>
        Back to agency
      </Link>
      <h1>Agency booking requests</h1>
      <p>
        Review the requests for this agency. Requirement submission and review
        are the next workflow stage.
      </p>
      <BookingList list={list} base={`/agency/${id}/bookings`} />
    </Workspace>
  );
}
