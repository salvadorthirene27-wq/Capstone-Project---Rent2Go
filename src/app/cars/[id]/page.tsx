import Link from "next/link";
import { notFound } from "next/navigation";
import { publicVehicle } from "@/modules/vehicles/service";
import { DomainError } from "@/modules/partners/workflow";
import { money } from "@/modules/partners/presentation";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const car = await publicVehicle((await params).id).catch((e) => {
    if (e instanceof DomainError && e.status === 404) notFound();
    throw e;
  });
  return (
    <main id="main-content" className="public-main agency-profile">
      <Link className="back-link" href={`/agencies/${car.agencyId}`}>
        View {car.agencyName}
      </Link>
      <h1>
        {car.facts.make} {car.facts.model}
      </h1>
      <p>
        {car.facts.year} · {car.facts.seats} seats ·{" "}
        {car.facts.transmission.toLowerCase()} · {car.facts.fuel.toLowerCase()}
      </p>
      <div className="vehicle-photo-grid">
        {car.photoIds.map((id) => (
          <img
            key={id}
            src={`/api/vehicle-files/${id}`}
            width={600}
            height={400}
            alt={`${car.facts.make} ${car.facts.model}, supplied by ${car.agencyName}`}
          />
        ))}
      </div>
      <div className="profile-layout">
        <section>
          <h2>About this vehicle</h2>
          <p className="preserve-lines">{car.facts.description}</p>
          <p>{car.facts.features.join(" · ")}</p>
          <h3>Pickup</h3>
          <p className="preserve-lines">{car.facts.pickupInstructions}</p>
          <h3>Included</h3>
          <p className="preserve-lines">{car.pricing.inclusions}</p>
          <h3>Excluded / additional charges</h3>
          <p className="preserve-lines">{car.pricing.exclusions}</p>
        </section>
        <aside className="profile-contact">
          <h2>{money(car.pricing.rateCentavos)}</h2>
          <p>
            {
              {
                "24_HOUR": "Per 24 hours",
                CALENDAR_DAY: "Per calendar day",
                HOUR: "Per hour",
              }[car.pricing.billingUnit]
            }
          </p>
          <p>Refundable deposit: {money(car.pricing.depositCentavos)}</p>
          <p>
            {car.pricing.modes
              .map((m) => (m === "SELF_DRIVE" ? "Self-drive" : "With driver"))
              .join(" / ")}
          </p>
          <p>
            Confirm dates and availability with the agency. Final charges and
            conditions are defined by the approved quotation and agreement.
          </p>
          <Link className="button" href={`/agencies/${car.agencyId}`}>
            Agency terms and contacts
          </Link>
        </aside>
      </div>
    </main>
  );
}
