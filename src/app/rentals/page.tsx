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
const units = {
  "24_HOUR": "per 24 hours",
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
    <main id="main-content" className="public-main directory-main">
      <div className="directory-heading">
        <div>
          <p className="page-eyebrow">Car rentals</p>
          <h1>A car that fits your journey.</h1>
          <p>
            Compare approved agency vehicles, choose your dates and understand
            the cost before requesting a booking.
          </p>
        </div>
        <Link href="/agencies">Browse by agency</Link>
      </div>
      <form action="/rentals" className="marketplace-form">
        {query.agencyId && (
          <>
            <input type="hidden" name="agencyId" value={query.agencyId} />
            <p>
              Showing the selected agency.{" "}
              <Link href="/rentals">Search all agencies</Link>
            </p>
          </>
        )}
        <div className="marketplace-filter-grid">
          <label>
            Make, model or keyword
            <input name="search" maxLength={120} defaultValue={query.search} />
          </label>
          <label>
            Service area
            <input
              name="serviceArea"
              maxLength={120}
              defaultValue={query.serviceArea}
              placeholder="e.g., Albay"
            />
          </label>
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
        </div>
        <details className="policy-disclosure">
          <summary>Vehicle filters and budget preferences</summary>
          <div className="marketplace-filter-grid">
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
              Body type
              <select name="bodyType" defaultValue={query.bodyType ?? ""}>
                <option value="">Any body type</option>
                {[
                  "SEDAN",
                  "HATCHBACK",
                  "SUV",
                  "MPV",
                  "VAN",
                  "PICKUP",
                  "OTHER",
                ].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
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
              Maximum listed unit rate (PHP)
              <input
                name="maxRatePHP"
                type="number"
                min="0.01"
                max="1000000"
                step="0.01"
                defaultValue={
                  query.maxRateCentavos ? query.maxRateCentavos / 100 : ""
                }
              />
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
            Recommendations prioritize budget fit, then your transmission
            preference and service estimate. Deposits are separate. No
            popularity or ratings are inferred.
          </p>
        </details>
        <div className="marketplace-search-actions">
          <label>
            Sort results
            <select name="sort" defaultValue={query.sort}>
              <option value="RECOMMENDED">Recommended for these filters</option>
              <option value="NAME">Vehicle name</option>
              <option value="PRICE_ASC">Listed unit rate: low to high</option>
              <option value="PRICE_DESC">Listed unit rate: high to low</option>
            </select>
          </label>
          <button className="button">Find rentals</button>
          <Link href="/rentals">Clear filters</Link>
        </div>
        <p>
          Times use Manila (UTC+08:00). For with-driver rentals, the agency
          driver occupies one seat in addition to your party.
        </p>
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
