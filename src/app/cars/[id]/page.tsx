import Link from "next/link";
import { CarFront, Fuel, Settings2, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { publicVehicle } from "@/modules/vehicles/service";
import { DomainError } from "@/modules/partners/workflow";
import { money } from "@/modules/partners/presentation";
import {
  rentalFilters,
  queryString,
  type RawFilters,
} from "@/modules/marketplace/filters";
import { searchVehicles } from "@/modules/marketplace/vehicles";
import { driverFeeUnitLabels } from "@/modules/pricing/units";
import { CartSelection } from "@/components/cart-selection";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawFilters>;
}) {
  const car = await publicVehicle((await params).id).catch((e) => {
    if (e instanceof DomainError && e.status === 404) notFound();
    throw e;
  });
  const { query, error } = rentalFilters(await searchParams),
    selected = query.startAt
      ? (
          await searchVehicles({
            id: car.id,
            startAt: query.startAt,
            endAt: query.endAt,
            mode: query.mode,
            partySize: query.partySize,
          })
        ).items[0]
      : null;
  return (
    <main id="main-content" className="public-main agency-profile figma-vehicle">
      <nav className="page-navigation" aria-label="Vehicle navigation">
        <Link href={`/rentals?${queryString(query)}`}>Back to car rentals</Link>
        <Link href="/cart">Your cart</Link>
      </nav>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {query.startAt && (
        <section className="notice">
          <h2>Your selected dates</h2>
          {selected?.estimate ? (
            <>
              <p>
                {selected.estimateMode === "SELF_DRIVE"
                  ? "Self-drive"
                  : "With-driver"}{" "}
                service estimate: {money(selected.estimate.serviceCentavos)} ·
                Refundable deposit:{" "}
                {money(selected.estimate.refundableDepositCentavos)} · Estimated
                total: {money(selected.estimate.estimatedDueCentavos)}
              </p>
              <p>
                No conflicting block was found. This is subject to the agency’s
                document review, quotation, agreement and final availability
                check.
              </p>
            </>
          ) : (
            <p>
              This vehicle or a required driver does not match the selected
              dates, mode or party size. Choose another interval or service.
            </p>
          )}
          <Link href={`/rentals?${queryString(query)}`}>
            Change dates or compare alternatives
          </Link>
        </section>
      )}
      <div className={`vehicle-photo-grid figma-gallery figma-gallery-${Math.min(car.photoIds.length, 3)}`}>
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
      <div className="profile-layout figma-vehicle-details">
        <section>
          <h1>{car.facts.make} {car.facts.model}</h1>
          <p>{car.facts.year}</p>
          <ul className="figma-specs" aria-label="Vehicle specifications">
            <li><CarFront size={17} aria-hidden="true"/>{car.facts.bodyType}</li>
            <li><Users size={17} aria-hidden="true"/>{car.facts.seats} seats</li>
            <li><Settings2 size={17} aria-hidden="true"/>{car.facts.transmission.toLowerCase()}</li>
            <li><Fuel size={17} aria-hidden="true"/>{car.facts.fuel.toLowerCase()}</li>
          </ul>
          <div className="figma-panel figma-vehicle-agency">
            <span className="avatar" aria-hidden="true">{car.agencyName[0]}</span>
            <div><strong>{car.agencyName}</strong><br/><Link href={`/agencies/${car.agencyId}`}>Agency terms and contacts</Link></div>
          </div>
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
        <aside id="rental-booking" className="profile-contact">
          <h2>{money(car.pricing.rateCentavos)}</h2>
          <p>
            {
              {
                "12_HOUR": "Per 12 hours", "24_HOUR": "Per 24 hours",
                CALENDAR_DAY: "Per calendar day",
                HOUR: "Per hour",
              }[car.pricing.billingUnit]
            }
          </p>
          <h3>Booking details</h3>
          <CartSelection
            key={`${car.id}:${car.revision}:${query.startAt}:${query.endAt}:${query.mode}:${query.partySize}`}
            initial={{
              kind: "RENTAL",
              offerId: car.id,
              startAt:
                query.startAt ?? new Date(Date.now() + 86400000).toISOString(),
              endAt:
                query.endAt ??
                new Date(Date.now() + 2 * 86400000).toISOString(),
              mode: query.mode ?? car.pricing.modes[0],
              partySize: query.partySize ?? 1,
            }}
            modes={car.pricing.modes}
            maxParty={car.facts.seats}
          />
          <p>Refundable deposit: {money(car.pricing.depositCentavos)}</p>
          {car.pricing.modes.includes("WITH_DRIVER") && (
            <p>
              Driver charge: {money(car.pricing.driverFeeCentavos)} ·{" "}
              {car.pricing.driverFeeUnit
                ? driverFeeUnitLabels[car.pricing.driverFeeUnit]
                : "Unit not configured; revised agreement required"}
            </p>
          )}
          <p>
            {car.pricing.modes
              .map((m) => (m === "SELF_DRIVE" ? "Self-drive" : "With driver"))
              .join(" / ")}
          </p>
          <p>
            Confirm dates and availability with the agency. Final charges and
            conditions are defined by the approved quotation and agreement.
          </p>

        </aside>
      </div>
    </main>
  );
}
