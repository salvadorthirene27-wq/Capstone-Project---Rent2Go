import type { VehicleFacts, VehicleTerms } from "@/modules/vehicles/schema";
import { money } from "@/modules/partners/presentation";
export function VehicleSummary({
  facts,
  terms,
}: {
  facts: VehicleFacts;
  terms: VehicleTerms;
}) {
  return (
    <>
      <dl className="vehicle-specs">
        <div>
          <dt>Vehicle</dt>
          <dd>
            {facts.year} {facts.make} {facts.model}
          </dd>
        </div>
        <div>
          <dt>Capacity / transmission</dt>
          <dd>
            {facts.seats} seats · {facts.transmission.toLowerCase()} ·{" "}
            {facts.fuel.toLowerCase()}
          </dd>
        </div>
        <div>
          <dt>Rate</dt>
          <dd>
            {money(terms.rateCentavos)}{" "}
            {
              {
                "24_HOUR": "per 24 hours",
                CALENDAR_DAY: "per calendar day",
                HOUR: "per hour",
              }[terms.billingUnit]
            }
          </dd>
        </div>
        <div>
          <dt>Refundable deposit</dt>
          <dd>{money(terms.depositCentavos)}</dd>
        </div>
        <div>
          <dt>Rental modes</dt>
          <dd>
            {terms.modes
              .map((m) => (m === "SELF_DRIVE" ? "Self-drive" : "With driver"))
              .join(", ")}
          </dd>
        </div>
        {terms.modes.includes("WITH_DRIVER") && (
          <div>
            <dt>Driver charge</dt>
            <dd>
              {money(terms.driverFeeCentavos)} · basis specified by agreement
            </dd>
          </div>
        )}
      </dl>
      <p className="preserve-lines">{facts.description}</p>
      <p>
        <strong>Pickup:</strong> {facts.pickupInstructions}
      </p>
      {!!facts.features.length && (
        <p>
          <strong>Features:</strong> {facts.features.join(", ")}
        </p>
      )}
      <h3>Included</h3>
      <p className="preserve-lines">{terms.inclusions}</p>
      <h3>Excluded / additional charges</h3>
      <p className="preserve-lines">{terms.exclusions}</p>
      <h3>Owner–agency terms</h3>
      <p className="preserve-lines">{terms.agreementTerms}</p>
      <h3>Eligible service-revenue allocation</h3>
      <p>
        Cosigner {terms.shares.cosigner / 100}% · Agency{" "}
        {terms.shares.agency / 100}% · Rent2Go {terms.shares.platform / 100}% ·
        Maintenance {terms.shares.maintenance / 100}%
      </p>
      <p>
        Refundable deposits are excluded. The agency holds maintenance as a
        separate reserve for this vehicle.
      </p>
    </>
  );
}
