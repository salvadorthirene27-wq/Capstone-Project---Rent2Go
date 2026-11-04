import { Workspace } from "@/components/workspace";
import { pageActor } from "@/lib/page-actor";
import { myApplication, getApplication } from "@/modules/partners/service";
import { PartnerForm } from "../partner-form";
import { StartApplication } from "./start-application";
export const dynamic = "force-dynamic";
export default async function Page() {
  const actor = await pageActor(),
    app = await myApplication(actor);
  return (
    <Workspace actor={actor}>
      {app ? (
        <PartnerForm initial={await getApplication(actor, app.id)} />
      ) : (
        <section className="context-section">
          <h1>Your agency starts here.</h1>
          <p>
            Create a saved application for your business details, policies,
            rates, and payment preferences. You can return to it before
            submitting for review.
          </p>
          <StartApplication />
        </section>
      )}
    </Workspace>
  );
}
