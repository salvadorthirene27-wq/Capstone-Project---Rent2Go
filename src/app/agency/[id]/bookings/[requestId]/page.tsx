import {BookingRefunds} from "@/components/booking-refunds";
import {BookingAssessments} from "@/components/booking-assessments";
import {BookingCancellation} from "@/components/booking-cancellation";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { BookingDetail } from "@/components/booking-detail";
import { BookingRequirements } from "@/components/booking-requirements";
import { BookingQuotation } from "@/components/booking-quotation";
import { BookingAgreement } from "@/components/booking-agreement";
import { BookingPayments } from "@/components/booking-payments";
import { BookingFulfillment } from "@/components/booking-fulfillment";
import { pageActor } from "@/lib/page-actor";
import { requireAgencyAccess } from "@/modules/agencies/service";
import { getBookingRequest } from "@/modules/bookings/service";
import { DomainError } from "@/modules/partners/workflow";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string; requestId: string }>;
}) {
  const actor = await pageActor(),
    { id, requestId } = await params;
  await requireAgencyAccess(actor, id).catch((e) => {
    if (e instanceof DomainError) notFound();
    throw e;
  });
  const booking = await getBookingRequest(actor, requestId).catch((e) => {
    if (e instanceof DomainError && e.status === 404) notFound();
    throw e;
  });
  if (booking.agencyId !== id) notFound();
  return (
    <Workspace actor={actor}>
      <Link className="back-link" href={`/agency/${id}/bookings`}>
        Back to agency requests
      </Link>
      {booking.isOwnRequest && (
        <p className="notice">
          You submitted this request. An independent authorized operator must
          review it.
        </p>
      )}
      <BookingDetail booking={booking} />
      <BookingCancellation key={`cancellation-${booking.version}`} requestId={requestId} />
      <BookingRequirements key={`requirements-${booking.version}`} requestId={requestId} />
      <BookingQuotation key={`quotation-${booking.version}`} requestId={requestId} />
      <BookingAgreement key={`agreement-${booking.version}`} requestId={requestId} />
      <BookingPayments key={`payments-${booking.version}`} requestId={requestId} />
      <BookingFulfillment key={`fulfillment-${booking.version}`} requestId={requestId} />
      <BookingRefunds key={`refunds-${booking.version}`} requestId={requestId} />
      <BookingAssessments key={`assessments-${booking.version}`} requestId={requestId} />
    </Workspace>
  );
}
