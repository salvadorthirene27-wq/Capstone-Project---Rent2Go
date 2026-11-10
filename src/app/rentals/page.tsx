import Link from "next/link";
import { searchVehicles } from "@/modules/marketplace/vehicles";
import {
  rentalFilters,
  queryString,
  localInput,
  type RawFilters,
} from "@/modules/marketplace/filters";
import { RentalFleetCard } from "@/components/rental-fleet-card";
export const dynamic = "force-dynamic";
export const metadata = { title: "Find a rental" };
const bodyTypes = {
  SEDAN: "Sedan",
  SUV: "SUV",
  MPV: "MPV",
  VAN: "Van",
  HATCHBACK: "Hatchback",
  PICKUP: "Pickup",
  OTHER: "Other",
} as const;
const units = {
  "12_HOUR": "per 12 hours", "24_HOUR": "per 24 hours",
  CALENDAR_DAY: "per calendar day",
  HOUR: "per hour",
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<RawFilters>;
}) {
  const { query, error } = rentalFilters(await searchParams),
    result = await searchVehicles(query),
    pageHref = (page: number) => `/rentals?${queryString({ ...query, page })}`;
  return (
    <main id="main-content" className="public-main directory-main figma-catalog">
      <Link className="back-link" href="/">Back to home page</Link>
      <div className="directory-heading">
        <div>
          <h1>Browse Cars</h1>
        </div>
        <Link href="/agencies">Browse by agency</Link>
      </div>
      <form action="/rentals" className="marketplace-form figma-search-panel">
        {query.agencyId && (
          <>
            <input type="hidden" name="agencyId" value={query.agencyId} />
            <p>
              Showing the selected agency.{" "}
              <Link href="/rentals">Search all agencies</Link>
            </p>
          </>
        )}
        <div className="figma-search-row">
          <label className="figma-search-field">
            <span className="sr-only">Make, model or keyword</span>
            <img src="/figma/catalog/search.svg" alt=""/>
            <input name="search" maxLength={120} defaultValue={query.search} placeholder="Search for cars…"/>
          </label>
          <label className="figma-search-field">
            <span className="sr-only">Service area</span>
            <img src="/figma/catalog/pin.png" width={21} height={21} alt=""/>
            <input name="serviceArea" maxLength={120} defaultValue={query.serviceArea} placeholder="Search your location…"/>
          </label>
          <fieldset className="figma-price-range">
            <legend>Listed rate (PHP)</legend>
            <input aria-label="Minimum listed unit rate (PHP)" name="minRatePHP" type="number" min="0" max="1000000" step="0.01" placeholder="Min" defaultValue={query.minRateCentavos === undefined ? "" : query.minRateCentavos / 100}/>
            <input aria-label="Maximum listed unit rate (PHP)" name="maxRatePHP" type="number" min="0.01" max="1000000" step="0.01" placeholder="Max" defaultValue={query.maxRateCentavos === undefined ? "" : query.maxRateCentavos / 100}/>
          </fieldset>
          <label className="figma-sort-field">Sort
            <select name="sort" defaultValue={query.sort}>
              <option value="RECOMMENDED">Recommended</option>
              <option value="NAME">Vehicle name</option>
              <option value="PRICE_ASC">Price: low to high</option>
              <option value="PRICE_DESC">Price: high to low</option>
            </select>
          </label>
        </div>
        {query.bodyType && <input type="hidden" name="bodyType" value={query.bodyType}/>}
        <nav className="figma-filter-chips figma-catalog-chips" aria-label="Vehicle categories">
          <Link aria-current={!query.bodyType ? "page" : undefined} href={`/rentals?${queryString({...query, bodyType:undefined, page:1})}`}>
            <span>All vehicles <small>{result.allCategories}</small></span>
          </Link>
          {Object.entries(bodyTypes).map(([value,label])=>(
            <Link key={value} aria-current={query.bodyType===value?"page":undefined} href={`/rentals?${queryString({...query, bodyType:value, page:1})}`}>
              <span>{label} <small>{result.categoryCounts[value] ?? 0}</small></span>
            </Link>
          ))}
        </nav>
        <details className="policy-disclosure" open={Boolean(query.startAt || query.mode || query.transmission || query.fuel || query.billingUnit || query.partySize || query.budgetCentavos || query.preferredTransmission)}>
          <summary>Dates, availability and more filters</summary>
          <div className="marketplace-filter-grid">
          <label>
            Rental mode
            <select name="mode" defaultValue={query.mode ?? ""}>
              <option value="">All offered modes</option>
              <option value="SELF_DRIVE">Self-drive</option>
              <option value="WITH_DRIVER">With agency driver</option>
            </select>
          </label>
          <label>
            People in your party
            <input
              type="number"
              name="partySize"
              min={1}
              max={50}
              defaultValue={query.partySize}
            />
          </label>
          <label>
            Pickup (Manila)
            <input
              type="datetime-local"
              name="startLocal"
              defaultValue={localInput(query.startAt)}
            />
          </label>
          <label>
            Return (Manila)
            <input
              type="datetime-local"
              name="endLocal"
              defaultValue={localInput(query.endAt)}
            />
          </label>
            <label>
              Required transmission
              <select
                name="transmission"
                defaultValue={query.transmission ?? ""}
              >
                <option value="">Any transmission</option>
                <option value="AUTOMATIC">Automatic</option>
                <option value="MANUAL">Manual</option>
              </select>
            </label>
            <label>
              Preferred transmission
              <select
                name="preferredTransmission"
                defaultValue={query.preferredTransmission ?? ""}
              >
                <option value="">No preference</option>
                <option value="AUTOMATIC">Automatic preferred</option>
                <option value="MANUAL">Manual preferred</option>
              </select>
            </label>
            <label>
              Fuel
              <select name="fuel" defaultValue={query.fuel ?? ""}>
                <option value="">Any fuel</option>
                {["GASOLINE", "DIESEL", "HYBRID", "ELECTRIC"].map((v) => (
                  <option key={v} value={v}>
                    {v.toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Vehicle billing unit
              <select name="billingUnit" defaultValue={query.billingUnit ?? ""}>
                <option value="">All units</option>
                {Object.entries(units).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Preferred service budget (PHP; add dates)
              <input
                name="budgetPHP"
                type="number"
                min="0.01"
                max="1000000"
                step="0.01"
                defaultValue={
                  query.budgetCentavos ? query.budgetCentavos / 100 : ""
                }
              />
            </label>
          </div>
          <p>
            Times use Manila (UTC+08:00). An agency driver occupies one seat in addition to your party.
            Recommendations use budget fit, your transmission preference and service estimates. Deposits are separate.
          </p>
        </details>
        <div className="figma-catalog-actions">
          <button className="button">Find rentals</button>
          <Link className="figma-clear-filters" href="/rentals">Clear filters</Link>
        </div>
      </form>
      {error && (
        <p className="notice" role="alert">
          {error} Showing all listings; update the filters and search again.
        </p>
      )}
      <p className="result-count">
        {result.total} {result.total === 1 ? "vehicle" : "vehicles"} found ·{" "}
        {query.startAt
          ? "Conflicting vehicle and required driver intervals excluded"
          : "Select pickup and return times to check availability"}
      </p>
      <div className="directory-list">
        {result.items.map((car) => (
          <RentalFleetCard key={car.id} car={car} href={`/cars/${car.id}?${queryString({ startAt: query.startAt, endAt: query.endAt, mode: query.mode, partySize: query.partySize })}`} />
        ))}
      </div>
      {!result.items.length && (
        <section className="directory-empty">
          <h2>No vehicles match this page</h2>
          <p>
            Try different dates, party size, service area or vehicle
            requirements.
          </p>
          <Link href={pageHref(1)}>Return to first page</Link>
        </section>
      )}
      {result.pageCount > 1 && (
        <nav className="pagination" aria-label="Rental pages">
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
      <p className="catalog-disclaimer">
        Search estimates do not reserve inventory. Your agency must review
        requirements and approve an itemized quotation and agreement before
        payment and handover.
      </p>
    </main>
  );
}
