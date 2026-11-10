import Link from "next/link";
import { CarFront, Fuel, Pencil, Settings2, Users } from "lucide-react";
import { listVehicleOffers, vehicleQueueSchema } from "@/modules/vehicles/service";
import type { Actor } from "@/modules/partners/workflow";
import { money } from "@/modules/partners/presentation";
export async function VehicleQueue({
  actor,
  scope,
  agencyId,
  page = 1,
  basePath,
  state,
}: {
  actor: Actor;
  scope: "OWNED" | "AGENCY" | "COMPLIANCE";
  agencyId?: string;
  page?: number;
  basePath: string;
  state?: string;
}) {
  const validState = vehicleQueueSchema.shape.state.safeParse(state || undefined);
  const selected = scope === "COMPLIANCE" || !validState.success ? undefined : validState.data;
  const q = await listVehicleOffers(actor, { scope, agencyId, page, state:selected });
  const pageHref = (n:number) => `${basePath}?${new URLSearchParams({page:String(n),...(selected?{state:selected}:{})})}`;
  const states = vehicleQueueSchema.shape.state.unwrap().options;
  const label = (value:string) => value.replaceAll("_", " ").toLowerCase();
  return (
    <>
      {scope !== "COMPLIANCE" && <details className="figma-panel figma-listing-filters" open={Boolean(selected)}>
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
              : scope === "OWNED" ? "Offer a personal vehicle to an approved agency to begin your vehicle partnership." : "Create an agency vehicle draft or return when an owner submits a car to your agency."}
          </p>
        </section>
      ) : scope !== "COMPLIANCE" ? <>
        <p>{q.total} {q.total === 1 ? "listing" : "listings"}</p>
        <div className="figma-fleet-grid">
          {q.items.map(offer=>{
            const href = `/workspace/vehicles/${offer.id}`;
            return <article className="figma-panel figma-fleet-card" key={offer.id}>
              <div className="figma-listing-heading"><Link href={href}><Pencil size={14} aria-hidden="true"/>View details</Link><span className="status">{label(offer.state)}</span></div>
              <Link href={href} className="figma-listing-photo" aria-label={offer.displayName}>
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
              <p className="figma-listing-rate"><strong>{money(offer.terms.rateCentavos)}</strong> {{"24_HOUR":"per 24 hours",CALENDAR_DAY:"per calendar day",HOUR:"per hour"}[offer.terms.billingUnit]}</p>
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
                          "24_HOUR": "per 24 hours",
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
