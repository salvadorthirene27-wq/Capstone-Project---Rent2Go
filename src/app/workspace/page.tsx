import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Workspace } from "@/components/workspace";
import { pageActor } from "@/lib/page-actor";
import { myAgencies } from "@/modules/agencies/service";
import { myApplication } from "@/modules/partners/service";
export const dynamic = "force-dynamic";
export default async function Page() {
  const actor = await pageActor();
  const [agencies, application] = await Promise.all([
    myAgencies(actor),
    myApplication(actor),
  ]);
  return (
    <Workspace actor={actor}>
      <h1>Welcome, {actor.name}</h1>
      <p>Choose where you want to work today.</p>
      {actor.role === "SUPER_ADMIN" && (
        <section className="context-section">
          <h2>Platform reviews</h2>
          <p>Review partner applications and requested policy changes.</p>
          <Link className="button" href="/admin">
            Open partner review queue <ArrowRight size={18} />
          </Link>
        </section>
      )}
      {!!agencies.length && (
        <section className="context-section">
          <h2>Your agencies</h2>
          <div className="directory-list">
            {agencies.map((a) => (
              <Link
                className="context-link"
                key={a.id}
                href={`/agency/${a.id}`}
              >
                <span>
                  <strong>{a.name}</strong>
                  <small>Approved policy version {a.approvedRevision}</small>
                </span>
                <ArrowRight size={20} />
              </Link>
            ))}
          </div>
        </section>
      )}
      <section className="context-section">
        <h2>Find your next journey</h2>
        <p>
          Explore approved agencies and compare their services and policies.
        </p>
        <Link href="/agencies">
          Browse agencies <ArrowRight size={16} />
        </Link>
      </section>
      <section className="context-section">
        <h2>
          {application
            ? "Your partner application"
            : "Bring your agency to Rent2Go"}
        </h2>
        <p>
          {application
            ? `Current status: ${application.status.replaceAll("_", " ").toLowerCase()}. Your saved application and review history are available here.`
            : "Start an application when you are ready to register your business. Browsing does not create an agency application."}
        </p>
        <Link className="button secondary" href="/workspace/application">
          {application ? "Open application" : "Apply as an agency"}
        </Link>
      </section>
    </Workspace>
  );
}
