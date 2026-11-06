import {BookingSettlement} from "@/components/booking-settlement";
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
      <BookingCancellation key={`cancellation-${booking.version}`} requestId={(await params).id} />
      <BookingRequirements key={`requirements-${booking.version}`} requestId={(await params).id} />
      <BookingQuotation key={`quotation-${booking.version}`} requestId={(await params).id} />
      <BookingAgreement key={`agreement-${booking.version}`} requestId={(await params).id} />
      <BookingPayments key={`payments-${booking.version}`} requestId={(await params).id} />
      <BookingFulfillment key={`fulfillment-${booking.version}`} requestId={(await params).id} />
      <BookingRefunds key={`refunds-${booking.version}`} requestId={(await params).id} />
      <BookingAssessments key={`assessments-${booking.version}`} requestId={(await params).id} />
      <BookingSettlement requestId={booking.id}/>
    </Workspace>
  );
}
