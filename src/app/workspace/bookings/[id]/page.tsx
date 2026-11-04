import Link from "next/link";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { BookingDetail } from "@/components/booking-detail";
import { pageActor } from "@/lib/page-actor";
import { getBookingRequest } from "@/modules/bookings/service";
import { DomainError } from "@/modules/partners/workflow";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await pageActor(),
    booking = await getBookingRequest(actor, (await params).id).catch((e) => {
      if (e instanceof DomainError && e.status === 404) notFound();
      throw e;
    });
  if (!booking.isOwnRequest) notFound();
  return (
    <Workspace actor={actor}>
      <Link className="back-link" href="/workspace/bookings">
        Back to your requests
      </Link>
      <BookingDetail booking={booking} />
    </Workspace>
  );
}
