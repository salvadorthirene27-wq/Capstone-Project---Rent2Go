import Link from "next/link";
import { Workspace } from "@/components/workspace";
import { pageActor } from "@/lib/page-actor";
import { requireAgencyAccess } from "@/modules/agencies/service";
import { DomainError } from "@/modules/partners/workflow";
import { serviceLabels } from "@/modules/partners/presentation";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await pageActor(),
    id = (await params).id;
  let agency;
  try {
    agency = await requireAgencyAccess(actor, id);
  } catch (e) {
    if (!(e instanceof DomainError)) throw e;
    return (
      <Workspace actor={actor}>
        <h1>Agency access unavailable</h1>
        <p>
          Your account does not have active access to this agency. Return to
          your workspace to choose an available agency.
        </p>
        <Link href="/workspace">Return to workspace</Link>
      </Workspace>
    );
  }
  return (
    <Workspace actor={actor}>
      <h1>{agency.name}</h1>
      <p>
        Your operating workspace · Approved policy version{" "}
        {agency.approvedRevision}
      </p>
      <section className="context-section">
        <h2>Your public profile</h2>
        <p>{agency.policy.serviceAreas}</p>
        <div className="service-tags">
          {agency.policy.services.map((s) => (
            <span key={s}>{serviceLabels[s]}</span>
          ))}
        </div>
        <p>
          <Link href={`/agencies/${agency.id}`}>
            View public agency profile
          </Link>
        </p>
      </section>
      <section className="context-section">
        <h2>Consigned-vehicle agreement defaults</h2>
        <p>
          Cosigner {agency.policy.split.cosigner / 100}% · Agency{" "}
          {agency.policy.split.agency / 100}% · Rent2Go{" "}
          {agency.policy.split.platform / 100}% · Vehicle maintenance{" "}
          {agency.policy.split.maintenance / 100}%
        </p>
        <p>
          These policy defaults must be accepted in each vehicle agreement. The
          maintenance allocation remains a separate vehicle reserve.
        </p>
        {agency.ownerId === actor.id && (
          <Link className="button secondary" href="/workspace/application">
            Manage policies and application
          </Link>
        )}
      </section>
      <section className="context-section">
        <h2>Service inventory</h2>
        <p>
          Vehicle and tour listing setup is the next module being built. Your
          approved profile is available now.
        </p>
      </section>
    </Workspace>
  );
}
