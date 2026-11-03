import Link from "next/link";
import { redirect } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { pageActor } from "@/lib/page-actor";
import { applicationQueue } from "@/modules/partners/service";
import { statusLabel, date } from "@/modules/partners/presentation";
export const dynamic = "force-dynamic";
export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; view?: string }>;
}) {
  const actor = await pageActor();
  if (actor.role !== "SUPER_ADMIN") redirect("/workspace");
  const q = await searchParams,
    page = Math.min(
      100000,
      Math.max(1, Number.parseInt(q.page || "1", 10) || 1),
    ),
    pendingOnly = q.view !== "all",
    queue = await applicationQueue(actor, { page, pendingOnly });
  return (
    <Workspace actor={actor}>
      <div className="page-title">
        <div>
          <h1>Partner reviews</h1>
          <p>
            Review agency details, policies, evidence, and payment preferences.
          </p>
        </div>
        <span className="status">{queue.pendingCount} awaiting review</span>
      </div>
      <nav className="queue-tabs" aria-label="Review filter">
        <Link
          className={pendingOnly ? "button" : "button secondary"}
          href="/admin"
        >
          Awaiting review
        </Link>
        <Link
          className={!pendingOnly ? "button" : "button secondary"}
          href="/admin?view=all"
        >
          All applications
        </Link>
      </nav>
      {!queue.items.length ? (
        <section className="notice">
          <h2>No applications in this view</h2>
          <p>Submitted applications will appear in the review queue.</p>
        </section>
      ) : (
        <div className="table-wrap">
          <table>
            <caption>
              {queue.total} applications · page {queue.page} of{" "}
              {queue.pageCount}
            </caption>
            <thead>
              <tr>
                <th>Agency</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Application</th>
              </tr>
            </thead>
            <tbody>
              {queue.items.map((a) => (
                <tr key={a.id}>
                  <td>
                    <strong>{a.payload.businessName || "Unnamed draft"}</strong>
                    <small>
                      {a.payload.serviceAreas || "Service areas not set"}
                    </small>
                  </td>
                  <td>
                    <span
                      className={`status ${a.status === "APPROVED" ? "approved" : ""}`}
                    >
                      {statusLabel(a.status)}
                    </span>
                  </td>
                  <td>{date(a.updatedAt)}</td>
                  <td>
                    <Link
                      className="text-link"
                      href={`/admin/applications/${a.id}`}
                    >
                      Review details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav className="form-actions" aria-label="Queue pages">
        {queue.page > 1 && (
          <Link
            className="button secondary"
            href={`/admin?view=${pendingOnly ? "pending" : "all"}&page=${queue.page - 1}`}
          >
            Previous page
          </Link>
        )}
        {queue.page < queue.pageCount && (
          <Link
            className="button secondary"
            href={`/admin?view=${pendingOnly ? "pending" : "all"}&page=${queue.page + 1}`}
          >
            Next page
          </Link>
        )}
      </nav>
    </Workspace>
  );
}
