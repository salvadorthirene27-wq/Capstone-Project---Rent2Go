import Link from "next/link";
import type { listBookingRequests } from "@/modules/bookings/service";
import { date } from "@/modules/partners/presentation";
const statusLabels: Record<string, string> = {
  REQUIREMENTS_PENDING: "Requirements pending",
  UNDER_REVIEW: "Under review",
  CHANGES_REQUESTED: "Changes requested",
  READY_FOR_APPROVAL: "Ready for approval",
  REJECTED: "Rejected",
  QUOTE_PENDING: "Quotation awaiting response",
  QUOTE_ACCEPTED: "Quotation accepted",
  QUOTE_DECLINED: "Quotation declined",
  HOLD_EXPIRED: "Hold expired",
  AGREEMENT_PENDING: "Agreement awaiting signature",
  AGREEMENT_SIGNED: "Agreement signed",
  PAYMENT_PARTIAL: "Partially paid",
  READY_FOR_SERVICE: "Ready for service",
  SERVICE_ACTIVE: "Service in progress",
  FULFILLMENT_RECONCILIATION_PENDING: "Fulfillment recorded · reconciliation pending",
  PAYMENT_RECONCILIATION_REQUIRED: "Payment reconciliation required",
};
export function BookingList({
  list,
  base,
}: {
  list: Awaited<ReturnType<typeof listBookingRequests>>;
  base: string;
}) {
  return (
    <>
      <p>
        {list.total} requests · Page {list.page} of {list.pageCount}
      </p>
      {!list.items.length ? (
        <p>No booking requests yet.</p>
      ) : (
        <div className="directory-list">
          {list.items.map((r) => (
            <Link className="context-link" href={`${base}/${r.id}`} key={r.id}>
              <span>
                <strong>{r.agencyName}</strong>
                <small>
                  {r.contact.name} · {date(r.createdAt)}
                </small>
              </span>
              <span>{statusLabels[r.status] ?? r.status.replaceAll("_", " ")}{r.paymentEnvironment==="DEMO"&&<small>Demo payment — no money moves</small>}</span>
            </Link>
          ))}
        </div>
      )}
      <nav className="page-navigation" aria-label="Request pages">
        {list.page > 1 && (
          <Link href={`${base}?page=${list.page - 1}`}>Previous</Link>
        )}
        {list.page < list.pageCount && (
          <Link href={`${base}?page=${list.page + 1}`}>Next</Link>
        )}
      </nav>
    </>
  );
}
