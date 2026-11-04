import Link from "next/link";
import { listResources } from "@/modules/resources/service";
import type { Actor } from "@/modules/partners/workflow";
export async function ResourceList({
  actor,
  scope,
  agencyId,
  page = 1,
  basePath,
}: {
  actor: Actor;
  scope: "OWNED" | "AGENCY";
  agencyId?: string;
  page?: number;
  basePath: string;
}) {
  const q = await listResources(actor, { scope, agencyId, page });
  return (
    <>
      {!q.items.length ? (
        <section className="notice">
          <h2>No vehicles or drivers here yet</h2>
          <p>
            {scope === "OWNED"
              ? "Add a personal vehicle to manage its unavailability and maintenance."
              : "Agency-owned cars, submitted personal vehicles and your driver roster appear here."}
          </p>
        </section>
      ) : (
        <div className="table-wrap">
          <table>
            <caption>
              {q.total} resources · Page {q.page} of {q.pageCount}
            </caption>
            <thead>
              <tr>
                <th>Vehicle / driver</th>
                <th>Type</th>
                <th>Status</th>
                <th>Calendar</th>
              </tr>
            </thead>
            <tbody>
              {q.items.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.label}</strong>
                    <small>
                      {r.registration ?? "Driver identity details are private"}
                    </small>
                  </td>
                  <td>{r.kind === "DRIVER" ? "Driver" : "Vehicle"}</td>
                  <td>
                    {r.driver
                      ? r.driver.active
                        ? "Active"
                        : "Inactive"
                      : "Managed by listing approval"}
                  </td>
                  <td>
                    <Link href={`/workspace/resources/${r.id}`}>
                      Open calendar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {q.pageCount > 1 && (
        <nav className="pagination" aria-label="Resource pages">
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
