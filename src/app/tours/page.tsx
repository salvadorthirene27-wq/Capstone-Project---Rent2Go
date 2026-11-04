import Link from "next/link";
import { publicTours } from "@/modules/tours/service";
import { tourSearchSchema } from "@/modules/tours/schema";
import { money } from "@/modules/partners/presentation";
export const dynamic = "force-dynamic";
export const metadata = { title: "Explore tours" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams,
    parsed = tourSearchSchema.safeParse({
      search: q.search ?? "",
      mode: q.mode || undefined,
      partySize: q.partySize || undefined,
      page: q.page ?? 1,
      sort: q.sort || "NAME",
    }),
    query = parsed.success ? parsed.data : tourSearchSchema.parse({}),
    result = await publicTours(query);
  function pageHref(page: number) {
    return `/tours?${new URLSearchParams({ search: query.search, ...(query.mode ? { mode: query.mode } : {}), ...(query.partySize ? { partySize: String(query.partySize) } : {}), sort: query.sort, page: String(page) })}`;
  }
  return (
    <main id="main-content" className="public-main directory-main">
      <div className="directory-heading">
        <div>
          <h1>Find your next experience.</h1>
          <p>
            Join a scheduled group tour or choose a private experience for your
            party. Compare the itinerary, inclusions and agency terms.
          </p>
        </div>
      </div>
      <form action="/tours" className="directory-filters tour-filters">
        <label>
          Package or destination
          <input name="search" maxLength={120} defaultValue={query.search} />
        </label>
        <label>
          Tour model
          <select name="mode" defaultValue={query.mode ?? ""}>
            <option value="">All tours</option>
            <option value="GROUP">Group · per person</option>
            <option value="PRIVATE">Private · per party</option>
          </select>
        </label>
        <label>
          Guests
          <input
            name="partySize"
            type="number"
            min={1}
            max={500}
            defaultValue={query.partySize}
          />
        </label>
        <label>
          Sort
          <select name="sort" defaultValue={query.sort}>
            <option value="NAME">Package name</option>
            <option value="PRICE_ASC">Unit price: low to high</option>
            <option value="PRICE_DESC">Unit price: high to low</option>
          </select>
        </label>
        <button className="button">Find tours</button>
      </form>
      {!parsed.success && (
        <p role="alert">
          Some filters were invalid. Showing all packages; enter your search
          again.
        </p>
      )}
      <p className="result-count">
        {result.total} {result.total === 1 ? "package" : "packages"} found.
        Prices state their unit; refundable deposits and separately quoted
        extras are not included.
      </p>
      <div className="directory-list">
        {result.items.map((t) => (
          <article key={t.id} className="agency-row tour-row">
            <img
              src={`/api/tour-photos/${t.photoId}`}
              alt={`${t.title}, supplied by ${t.agencyName}`}
              width={260}
              height={180}
            />
            <div>
              <h2>
                <Link href={`/tours/${t.id}`}>{t.title}</Link>
              </h2>
              <p>
                {t.serviceArea} · {t.agencyName}
              </p>
              <p>
                {t.minParty}–{t.maxParty} guests per booking ·{" "}
                {t.mode === "GROUP"
                  ? "Scheduled group tour"
                  : "Exclusive private party"}
              </p>
              <strong>
                {money(t.priceCentavos)}{" "}
                {t.mode === "GROUP" ? "per person" : "per party"}
              </strong>
            </div>
            <Link className="button secondary" href={`/tours/${t.id}`}>
              View package and dates
            </Link>
          </article>
        ))}
      </div>
      {!result.items.length && (
        <section className="directory-empty">
          <h2>No tours match this page</h2>
          <p>Try another destination, tour model or party size.</p>
          <Link href="/tours">Reset search</Link>
        </section>
      )}
      {result.pageCount > 1 && (
        <nav className="pagination" aria-label="Tour pages">
          {query.page > 1 && (
            <Link href={pageHref(query.page - 1)}>Previous</Link>
          )}
          <span>
            Page {query.page} of {result.pageCount}
          </span>
          {query.page < result.pageCount && (
            <Link href={pageHref(query.page + 1)}>Next</Link>
          )}
        </nav>
      )}
    </main>
  );
}
