import Link from "next/link";
import { Workspace } from "@/components/workspace";
import { pageActor } from "@/lib/page-actor";
import { createApplication, getApplication } from "@/modules/partners/service";
import { PartnerForm } from "./partner-form";
export const dynamic = "force-dynamic";
export default async function Page() {
  const actor = await pageActor();
  if (actor.role === "SUPER_ADMIN")
    return (
      <Workspace actor={actor}>
        <h1>Welcome, {actor.name}</h1>
        <p>
          Review partner applications and help agencies prepare their services.
        </p>
        <Link className="button" href="/admin">
          Open partner review queue
        </Link>
      </Workspace>
    );
  const app = await createApplication(actor),
    detail = await getApplication(actor, app.id);
  return (
    <Workspace actor={actor}>
      <PartnerForm initial={detail} />
    </Workspace>
  );
}
