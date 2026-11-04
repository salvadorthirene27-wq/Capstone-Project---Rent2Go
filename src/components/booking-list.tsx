import Link from "next/link";
import type { listBookingRequests } from "@/modules/bookings/service";
import { date } from "@/modules/partners/presentation";
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
              <span>Requirements pending</span>
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
