import Link from "next/link";
import { Workspace } from "@/components/workspace";
import { TourEditor } from "@/components/tours/tour-editor";
import { pageActor } from "@/lib/page-actor";
import { pageAgency } from "@/lib/page-agency";
import type { TourInput } from "@/modules/tours/schema";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await pageActor(),
    agency = await pageAgency(actor, (await params).id),
    p = agency.policy,
    modes: TourInput["mode"][] = [];
  if (p.services.includes("GROUP_TOUR")) modes.push("GROUP");
  if (p.services.includes("PRIVATE_TOUR")) modes.push("PRIVATE");
  const mode = modes[0] ?? "GROUP",
    defaults: TourInput = {
      title: "",
      mode,
      description: "",
      serviceArea: p.serviceAreas,
      meetingPoint: p.address,
      itinerary: [{ title: "", description: "" }],
      inclusions: p.inclusions,
      exclusions: p.exclusions,
      eligibilityTerms: p.eligibilityTerms,
      terms: p.terms,
      cancellationPolicy: p.cancellationPolicy,
      refundPolicy: p.refundPolicy,
      priceCentavos:
        (mode === "GROUP" ? p.perPersonCentavos : p.perPartyCentavos) ?? 0,
      minParty: 1,
      maxParty: mode === "GROUP" ? 8 : 6,
      transportIncluded: false,
      fulfillment: "TOUR_ONLY",
    };
  return (
    <Workspace actor={actor}>
      <Link className="back-link" href={`/agency/${agency.id}/tours`}>
        Tour packages
      </Link>
      {!modes.length ? (
        <section className="notice">
          <h1>Tour service approval required</h1>
          <p>
            Your current approved agency policy does not include tours. The
            agency owner can request a policy amendment from the application
            workspace.
          </p>
        </section>
      ) : (
        <TourEditor
          initial={null}
          agencyId={agency.id}
          defaults={defaults}
          modes={modes}
        />
      )}
    </Workspace>
  );
}
