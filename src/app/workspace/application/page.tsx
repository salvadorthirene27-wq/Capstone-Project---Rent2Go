import { Workspace } from "@/components/workspace";
import { pageActor } from "@/lib/page-actor";
import { myApplication, getApplication } from "@/modules/partners/service";
import { PartnerForm } from "../partner-form";
import { StartApplication } from "./start-application";
import {PartnershipGuide} from '@/components/partnership-guide';
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page() {
  const actor = await pageActor();
  if (actor.role === "COSIGNER") redirect("/workspace/vehicles/new");
  const app = await myApplication(actor);
  return (
    <Workspace actor={actor}>
      {app&&<PartnershipGuide/>}
      <section id="agency-application" aria-label="Agency application">
      {app ? (
        <PartnerForm initial={await getApplication(actor, app.id)} />
      ) : (
        <section className="context-section">
          <h1>Agency partnership</h1>
          <p>
            Create a saved application for your business details, policies,
            rates, and payment preferences. You can return to it before
            submitting for review.
          </p>
          <StartApplication />
        </section>
      )}
      </section>
      {!app&&<PartnershipGuide open/>}
    </Workspace>
  );
}
