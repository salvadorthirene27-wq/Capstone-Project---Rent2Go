import Link from "next/link";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { BookingList } from "@/components/booking-list";
import { pageActor } from "@/lib/page-actor";
import { bookingListSchema } from "@/modules/bookings/schema";
import { listBookingRequests } from "@/modules/bookings/service";

export const dynamic = "force-dynamic";
const views = [
  ["CURRENT", "Current bookings"],
  ["HISTORY", "Booking history"],
  ["COMPLETED", "Completed"],
  ["CANCELLED", "Cancelled"],
] as const;

export default async function Page({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await pageActor();
  const raw = await searchParams;
  const parsed = bookingListSchema.safeParse({
    view: raw.view,
    page: raw.page,
    search: raw.search || undefined,
    year: raw.year || undefined,
  });
  if (!parsed.success) notFound();
  const filters = parsed.data;
  const title = filters.view && filters.view !== "CURRENT" ? "Booking history" : "My bookings";
  const base = "/workspace/bookings";
  const extraQuery = {
    ...(filters.view ? {view: filters.view} : {}),
    ...(filters.search ? {search: filters.search} : {}),
    ...(filters.year ? {year: String(filters.year)} : {}),
  };
  return (
    <Workspace actor={actor}>
      <Link className="back-link" href="/workspace">Back to dashboard</Link>
      <h1>{title}</h1>
      <form className="figma-booking-search" action={base}>
        {filters.view && <input type="hidden" name="view" value={filters.view}/>}
        <label>Search bookings<input name="search" defaultValue={filters.search} maxLength={120} placeholder="Vehicle, tour or agency"/></label>
        <label>Year submitted<input name="year" type="number" min={2000} max={2100} defaultValue={filters.year} placeholder="Any year"/></label>
        <button className="button">Search</button>
        <Link href={base}>Clear filters</Link>
      </form>
      <section className="figma-panel">
        <nav className="figma-filter-chips" aria-label="Booking history filters">
          <Link href={base} aria-current={!filters.view ? "page" : undefined}>All bookings</Link>
          {views.map(([value,label]) => <Link key={value} href={`${base}?${new URLSearchParams({...extraQuery,view:value})}`} aria-current={filters.view===value ? "page" : undefined}>{label}</Link>)}
        </nav>
        <BookingList list={await listBookingRequests(actor, filters)} base={base} extraQuery={extraQuery}/>
      </section>
    </Workspace>
  );
}
