import Link from "next/link";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { VehicleEditor } from "@/components/vehicles/vehicle-editor";
import { pageActor } from "@/lib/page-actor";
import { vehicleDetail } from "@/modules/vehicles/service";
import { DomainError } from "@/modules/partners/workflow";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await pageActor(),
    detail = await vehicleDetail(actor, (await params).id).catch((e) => {
      if (e instanceof DomainError && e.status === 404) notFound();
      throw e;
    });
  return (
    <Workspace actor={actor}>
      <Link
        className="back-link"
        href={
          detail.capabilities.isAgency
            ? `/agency/${detail.agencyId}/vehicles`
            : detail.capabilities.independentReviewer
              ? "/admin/vehicles"
              : "/workspace/vehicles"
        }
      >
        Back to vehicles
      </Link>
      <p>
        <Link href={`/workspace/resources/${detail.vehicleId}`}>
          Availability and maintenance
        </Link>{" "}
        · Operating agency:{" "}
        <Link href={`/agencies/${detail.agencyId}`}>{detail.agencyName}</Link>
        {detail.state === "PUBLISHED" && (
          <>
            {" "}
            · <Link href={`/cars/${detail.id}`}>View public vehicle</Link>
          </>
        )}
      </p>
      <VehicleEditor key={`${detail.id}:${detail.version}`} initial={detail} />
    </Workspace>
  );
}
