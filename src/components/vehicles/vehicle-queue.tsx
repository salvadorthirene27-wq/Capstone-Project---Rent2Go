import Link from "next/link";
import { CarFront, Fuel, Pencil, Settings2, Users } from "lucide-react";
import { listVehicleOffers, vehicleQueueSchema, type AgencyListingFilters } from "@/modules/vehicles/service";
import type { Actor } from "@/modules/partners/workflow";
import { money } from "@/modules/partners/presentation";
export const listingAvailabilityLabels = {AVAILABLE:"Available now", RESERVED:"Reserved", MAINTENANCE:"Under maintenance", UNAVAILABLE:"Unavailable"};
export async function VehicleQueue({
  actor,
  scope,
  agencyId,
  page = 1,
  basePath,
  state,
  filters,
  listingQuery,
}: {
  actor: Actor;
  scope: "OWNED" | "AGENCY" | "COMPLIANCE";
  agencyId?: string;
  page?: number;
  basePath: string;
  state?: string;
  filters?: AgencyListingFilters;
  listingQuery?: string;
}) {
  const validState = vehicleQueueSchema.shape.state.safeParse(state || undefined);
  const selected = scope === "COMPLIANCE" || !validState.success ? undefined : validState.data;
  const q = await listVehicleOffers(actor, { scope, agencyId, page, state:selected, filters });
  const listingHref = (changes: Record<string, string>) => {
    const query = new URLSearchParams(listingQuery);
    for (const [key,value] of Object.entries(changes)) query.set(key,value);
    return `${basePath}?${query}`;
  };
  const pageHref = (n:number) => listingHref({page:String(n),...(selected?{state:selected}:{})});
  const states = vehicleQueueSchema.shape.state.unwrap().options;
  const label = (value:string) => value.replaceAll("_", " ").toLowerCase();
  return (
    <>
      {scope === "OWNED" && <details className="figma-panel figma-listing-filters" open={Boolean(selected)}>
        <summary>Filters</summary>
        <form action={basePath}>
          <label>Listing status <select name="state" defaultValue={selected ?? ""}>
            <option value="">All listings</option>
            {states.map(option=><option key={option} value={option}>{label(option)}</option>)}
          </select></label>
          <button className="button">Apply filters</button>
          <Link href={basePath}>Clear filters</Link>
        </form>
      </details>}
      {!q.items.length ? (
        <section className="notice">
          <h2>No vehicles in this view</h2>
          <p>
            {scope === "COMPLIANCE"
              ? "Accepted vehicle agreements awaiting independent compliance review will appear here."
              : scope === "OWNED" ? "Offer a personal vehicle to an approved agency to begin your vehicle partnership." : filters && Object.values(filters).some(value => value !== undefined) ? "No listings match the selected filters." : "Add an agency vehicle or return when an owner submits a car to your agency."}
          </p>
        </section>
      ) : scope !== "COMPLIANCE" ? <>
        <p className={scope === "AGENCY" ? "sr-only" : undefined}>{q.total} {q.total === 1 ? "listing" : "listings"}</p>
        <div className="figma-fleet-grid">
          {q.items.map(offer=>{
            const href = `/workspace/vehicles/${offer.id}`;
            const editable = scope === "AGENCY" && (offer.ownership === "AGENCY_OWNED" || offer.ownerId === actor.id);
            const detailHref = editable ? listingHref({edit:offer.id}) : href;
            const liveStatus = offer.state === "PUBLISHED" && offer.availability ? listingAvailabilityLabels[offer.availability] : label(offer.state);
            return <article className="figma-panel figma-fleet-card" key={offer.id}>
              <div className="figma-listing-heading"><Link href={detailHref} scroll={!editable}><Pencil size={14} aria-hidden="true"/>{editable ? "Edit details" : "View details"}<span className="sr-only"> for {offer.displayName}</span></Link><span className="status" data-availability={offer.state === "PUBLISHED" ? offer.availability : undefined}>{liveStatus}</span></div>
              <Link href={detailHref} scroll={!editable} className="figma-listing-photo" aria-label={offer.displayName}>
                {offer.photoId ? <img src={`/api/vehicle-files/${offer.photoId}`} alt="" width={360} height={220} loading="lazy"/> : <CarFront size={52} aria-hidden="true"/>}
              </Link>
              <p>{offer.agencyName} · {offer.ownership === "CONSIGNED" ? "Cosigner-owned" : "Agency-owned"}</p>
              <h2>{offer.displayName} {offer.facts.year}</h2>
              <p>Plate number {offer.registration}</p>
              <ul className="figma-specs" aria-label="Vehicle specifications">
                <li><Users size={15} aria-hidden="true"/>{offer.facts.seats} seats</li>
                <li><Settings2 size={15} aria-hidden="true"/>{offer.facts.transmission.toLowerCase()}</li>
                <li><Fuel size={15} aria-hidden="true"/>{offer.facts.fuel.toLowerCase()}</li>
              </ul>
              <p className="figma-listing-rate"><strong>{money(offer.terms.rateCentavos)}</strong> {{"12_HOUR":"per 12 hours", "24_HOUR":"per 24 hours",CALENDAR_DAY:"per calendar day",HOUR:"per hour"}[offer.terms.billingUnit]}</p>
            </article>;
          })}
        </div>
      </> : (
        <div className="table-wrap">
          <table>
            <caption>
              {q.total} {q.total === 1 ? "vehicle" : "vehicles"} · Page {q.page}{" "}
              of {q.pageCount}
            </caption>
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Agency / ownership</th>
                <th>Status</th>
                <th>Rate</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {q.items.map((o) => (
                <tr key={o.id}>
                  <td>
                    <strong>
                      {o.displayName}
                    </strong>
                    <small>
                      {o.registration} · {o.facts.year}
                    </small>
                  </td>
                  <td>
                    {o.agencyName}
                    <small>
                      {o.ownership === "CONSIGNED"
                        ? "Cosigner-owned"
                        : "Agency-owned"}
                    </small>
                  </td>
                  <td>
                    <span className="status">
                      {o.state.replaceAll("_", " ").toLowerCase()}
                    </span>
                  </td>
                  <td>
                    {money(o.terms.rateCentavos)}
                    <small>
                      {
                        {
                          "12_HOUR": "per 12 hours", "24_HOUR": "per 24 hours",
                          CALENDAR_DAY: "per calendar day",
                          HOUR: "per hour",
                        }[o.terms.billingUnit]
                      }
                    </small>
                  </td>
                  <td>
                    <Link href={`/workspace/vehicles/${o.id}`}>
                      Open vehicle
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {q.pageCount > 1 && (
        <nav className="pagination" aria-label="Vehicle pages">
          {q.page > 1 && (
            <Link href={pageHref(q.page - 1)}>Previous</Link>
          )}
          <span>
            Page {q.page} of {q.pageCount}
          </span>
          {q.page < q.pageCount && (
            <Link href={pageHref(q.page + 1)}>Next</Link>
          )}
        </nav>
      )}
    </>
  );
}
