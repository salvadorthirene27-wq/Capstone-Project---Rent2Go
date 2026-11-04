import Link from "next/link";
import { publicTours } from "@/modules/tours/service";
import { tourSearchSchema } from "@/modules/tours/schema";
import { queryString } from "@/modules/marketplace/filters";
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
      agencyId: q.agencyId || undefined,
      dateFrom: q.dateFrom || undefined,
      dateTo: q.dateTo || undefined,
      budgetCentavos: q.budgetPHP
        ? Math.round(Number(q.budgetPHP) * 100)
        : q.budgetCentavos || undefined,
      maxPriceCentavos: q.maxPriceCentavos || undefined,
      mode: q.mode || undefined,
      partySize: q.partySize || undefined,
      page: q.page ?? 1,
      sort: q.sort || "RECOMMENDED",
    }),
    query = parsed.success ? parsed.data : tourSearchSchema.parse({}),
    result = await publicTours(query);
  function pageHref(page: number) {
    return `/tours?${queryString({ ...query, page })}`;
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
      <form action="/tours" className="marketplace-form">
        {query.agencyId && (
          <>
            <input type="hidden" name="agencyId" value={query.agencyId} />
            <p>
              Showing the selected agency.{" "}
              <Link href="/tours">Search all agencies</Link>
            </p>
          </>
        )}
        <div className="marketplace-filter-grid">
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
            Departure from (Manila)
            <input type="date" name="dateFrom" defaultValue={query.dateFrom} />
          </label>
          <label>
            Departure through (Manila)
            <input type="date" name="dateTo" defaultValue={query.dateTo} />
          </label>
          <label>
            Preferred whole-party budget (PHP; set guests)
            <input
              type="number"
              name="budgetPHP"
              min="0.01"
              max="1000000"
              step="0.01"
              defaultValue={
                query.budgetCentavos ? query.budgetCentavos / 100 : ""
              }
            />
          </label>
          <label>
            Sort
            <select name="sort" defaultValue={query.sort}>
              <option value="RECOMMENDED">Recommended for your party</option>
              <option value="NAME">Package name</option>
              <option value="PRICE_ASC">Unit price: low to high</option>
              <option value="PRICE_DESC">Unit price: high to low</option>
            </select>
          </label>
        </div>
        <div className="marketplace-search-actions">
          <button className="button">Find tours</button>
          <Link href="/tours">Clear filters</Link>
        </div>
        <p>
          Departure dates use Manila. Recommendations compare actual whole-party
          service estimates and your preferred budget.
        </p>
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
                <Link
                  href={`/tours/${t.id}?${queryString({ dateFrom: query.dateFrom, dateTo: query.dateTo, partySize: query.partySize })}`}
                >
                  {t.title}
                </Link>
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
              {t.estimatedServiceCentavos !== null && (
                <p>
                  Whole-party service estimate:{" "}
                  <strong>{money(t.estimatedServiceCentavos)}</strong>
                </p>
              )}
              <details className="policy-disclosure">
                <summary>Why this matches</summary>
                <ul>
                  {t.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </details>
            </div>
            <Link
              className="button secondary"
              href={`/tours/${t.id}?${queryString({ dateFrom: query.dateFrom, dateTo: query.dateTo, partySize: query.partySize })}`}
            >
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
