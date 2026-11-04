import { Workspace } from "@/components/workspace";
import { BookingList } from "@/components/booking-list";
import { pageActor } from "@/lib/page-actor";
import { listBookingRequests } from "@/modules/bookings/service";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const actor = await pageActor(),
    q = await searchParams;
  return (
    <Workspace actor={actor}>
      <h1>Your booking requests</h1>
      <p>
        Follow submitted requests separately for each agency. No payment or
        reservation is created at submission.
      </p>
      <BookingList
        list={await listBookingRequests(actor, { page: q.page ?? 1 })}
        base="/workspace/bookings"
      />
    </Workspace>
  );
}
