import Link from "next/link";
import { Workspace } from "@/components/workspace";
import { pageActor } from "@/lib/page-actor";
import { pageAgency } from "@/lib/page-agency";
import { listTours } from "@/modules/tours/service";
import { money } from "@/modules/partners/presentation";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const actor = await pageActor(),
    agency = await pageAgency(actor, (await params).id),
    q = await searchParams,
    page = Math.min(10000, Math.max(1, parseInt(q.page ?? "1", 10) || 1)),
    result = await listTours(actor, agency.id, page);
  return (
    <Workspace actor={actor}>
      <Link className="back-link" href={`/agency/${agency.id}`}>
        Agency workspace
      </Link>
      <div className="page-title">
        <div>
          <h1>{agency.name} tours</h1>
          <p>
            Publish packages and manage their group departures or exclusive
            private dates.
          </p>
        </div>
        <Link className="button" href={`/agency/${agency.id}/tours/new`}>
          Create tour package
        </Link>
      </div>
      {!result.items.length ? (
        <section className="notice">
          <h2>No packages on this page</h2>
          <p>
            Create your first package with its itinerary, guest rules and
            complete terms.
          </p>
        </section>
      ) : (
        <div className="table-wrap">
          <table>
            <caption>
              {result.total} packages · Page {result.page} of {result.pageCount}
            </caption>
            <thead>
              <tr>
                <th>Package</th>
                <th>Price model</th>
                <th>Status</th>
                <th>Manage</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.displayTitle}</strong>
                    <small>{t.payload.serviceArea}</small>
                  </td>
                  <td>
                    {money(t.payload.priceCentavos)}{" "}
                    {t.payload.mode === "GROUP" ? "per person" : "per party"}
                  </td>
                  <td>{t.state.toLowerCase()}</td>
                  <td>
                    <Link href={`/agency/${agency.id}/tours/${t.id}`}>
                      Open package
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result.pageCount > 1 && (
        <nav className="pagination" aria-label="Package pages">
          {page > 1 && <Link href={`?page=${page - 1}`}>Previous</Link>}
          <span>
            Page {page} of {result.pageCount}
          </span>
          {page < result.pageCount && (
            <Link href={`?page=${page + 1}`}>Next</Link>
          )}
        </nav>
      )}
    </Workspace>
  );
}
