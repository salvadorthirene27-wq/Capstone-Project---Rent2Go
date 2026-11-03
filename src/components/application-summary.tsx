import type { ApplicationInput } from "@/modules/partners/schema";
import {
  businessFields,
  termFields,
  fieldLabels,
  methodLabels,
  serviceLabels,
  money,
} from "@/modules/partners/presentation";
export function ApplicationSummary({
  payload: p,
}: {
  payload: ApplicationInput;
}) {
  return (
    <div className="application-summary">
      <section>
        <h3>Business details</h3>
        <dl className="summary-grid">
          {businessFields.map((k) => (
            <div key={k}>
              <dt>{fieldLabels[k]}</dt>
              <dd>{p[k] || "Not provided"}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section>
        <h3>Services</h3>
        <p>
          {p.services.map((s) => serviceLabels[s]).join(" · ") ||
            "Not selected"}
        </p>
      </section>
      <section>
        <h3>Terms & policies</h3>
        {termFields.map((k) => (
          <div className="policy-text" key={k}>
            <h4>{fieldLabels[k]}</h4>
            <p>{p[k] || "Not provided"}</p>
          </div>
        ))}
      </section>
      <section>
        <h3>Pricing</h3>
        <dl className="summary-grid">
          <div>
            <dt>Rental billing unit</dt>
            <dd>{p.billingUnit.replaceAll("_", " ").toLowerCase()}</dd>
          </div>
          {(
            [
              "dailyRateCentavos",
              "depositCentavos",
              "driverFeeCentavos",
              "perPersonCentavos",
              "perPartyCentavos",
            ] as const
          ).map((k) => (
            <div key={k}>
              <dt>{fieldLabels[k]}</dt>
              <dd>{money(p[k])}</dd>
            </div>
          ))}
          <div>
            <dt>Quote hold period</dt>
            <dd>{p.holdHours === null ? "Not set" : `${p.holdHours} hours`}</dd>
          </div>
          <div>
            <dt>Turnaround buffer</dt>
            <dd>
              {p.bufferMinutes === null
                ? "Not set"
                : `${p.bufferMinutes} minutes`}
            </dd>
          </div>
        </dl>
        <h4>Inclusions</h4>
        <p className="preserve-lines">{p.inclusions || "Not provided"}</p>
        <h4>Exclusions / extra charges</h4>
        <p className="preserve-lines">{p.exclusions || "Not provided"}</p>
      </section>
      <section>
        <h3>Payments & sharing</h3>
        <dl className="summary-grid">
          <div>
            <dt>Methods accepted from renters</dt>
            <dd>
              {p.acceptedMethods.map((m) => methodLabels[m]).join(" · ") ||
                "Not selected"}
            </dd>
          </div>
          <div>
            <dt>Agency-to-Rent2Go preference</dt>
            <dd>{methodLabels[p.platformPaymentMethod]}</dd>
          </div>
          <div>
            <dt>Settlement schedule</dt>
            <dd>{p.settlementSchedule.replaceAll("_", " ").toLowerCase()}</dd>
          </div>
          <div>
            <dt>Business-owned GCash account</dt>
            <dd>{p.gcashAccountName || "Not provided"}</dd>
          </div>
        </dl>
        <p className="preserve-lines">{p.gcashInstructions}</p>
        <div className="share-summary">
          {Object.entries(p.split).map(([key, value]) => (
            <div key={key}>
              <strong>{value / 100}%</strong>
              <span>{key === "platform" ? "Rent2Go" : key}</span>
            </div>
          ))}
        </div>
        <p className="muted">
          Proposed basis: eligible rental service revenue, excluding refundable
          deposits. Shares are adjustable by agreement; accepted booking
          versions will be retained.
        </p>
      </section>
    </div>
  );
}
