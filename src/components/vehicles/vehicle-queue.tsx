import Link from "next/link";
import { listVehicleOffers } from "@/modules/vehicles/service";
import type { Actor } from "@/modules/partners/workflow";
import { money } from "@/modules/partners/presentation";
export async function VehicleQueue({
  actor,
  scope,
  agencyId,
  page = 1,
  basePath,
}: {
  actor: Actor;
  scope: "OWNED" | "AGENCY" | "COMPLIANCE";
  agencyId?: string;
  page?: number;
  basePath: string;
}) {
  const q = await listVehicleOffers(actor, { scope, agencyId, page });
  return (
    <>
      {!q.items.length ? (
        <section className="notice">
          <h2>No vehicles in this view</h2>
          <p>
            {scope === "COMPLIANCE"
              ? "Accepted vehicle agreements awaiting independent compliance review will appear here."
              : "Create a vehicle draft or return when an owner submits a car to your agency."}
          </p>
        </section>
      ) : (
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
                      {o.facts.make} {o.facts.model}
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
            <Link href={`${basePath}?page=${q.page - 1}`}>Previous</Link>
          )}
          <span>
            Page {q.page} of {q.pageCount}
          </span>
          {q.page < q.pageCount && (
            <Link href={`${basePath}?page=${q.page + 1}`}>Next</Link>
          )}
        </nav>
      )}
    </>
  );
}
