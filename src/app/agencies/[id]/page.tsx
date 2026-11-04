import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Mail, Phone, ArrowLeft } from "lucide-react";
import { publicAgency } from "@/modules/agencies/service";
import { DomainError } from "@/modules/partners/workflow";
import {
  money,
  serviceLabels,
  methodLabels,
} from "@/modules/partners/presentation";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const agency = await publicAgency((await params).id).catch((e) => {
    if (e instanceof DomainError && e.status === 404) notFound();
    throw e;
  });
  const rates = agency.startingRates,
    unit = {
      "24_HOUR": "per 24 hours",
      CALENDAR_DAY: "per calendar day",
      HOUR: "per hour",
    }[rates.billingUnit];
  return (
    <main id="main-content" className="public-main agency-profile">
      <Link className="back-link" href="/agencies">
        <ArrowLeft size={17} />
        All agencies
      </Link>
      <header className="agency-profile-heading">
        <span className="status-badge">Approved partner</span>
        <h1>{agency.name}</h1>
        <p className="service-area">
          <MapPin size={18} />
          {agency.serviceAreas}
        </p>
        <div className="service-tags">
          {agency.services.map((s) => (
            <span key={s}>{serviceLabels[s]}</span>
          ))}
        </div>
      </header>
      <div className="profile-layout">
        <div>
          <section className="profile-section">
            <h2>Starting rates, with clear units.</h2>
            <p>
              Agency-declared starting prices. Final service details,
              availability, and itemized charges require an approved quotation.
            </p>
            <dl className="rate-list">
              {agency.services.some(
                (s) => s === "SELF_DRIVE" || s === "WITH_DRIVER",
              ) && (
                <>
                  <div>
                    <dt>Vehicle rental</dt>
                    <dd>
                      {money(rates.rentalCentavos)} <small>{unit}</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Refundable deposit</dt>
                    <dd>{money(rates.depositCentavos)}</dd>
                  </div>
                </>
              )}
              {agency.services.includes("WITH_DRIVER") && (
                <div>
                  <dt>Driver charge</dt>
                  <dd>
                    {money(rates.driverCentavos)}{" "}
                    <small>basis confirmed in quotation</small>
                  </dd>
                </div>
              )}
              {agency.services.includes("GROUP_TOUR") && (
                <div>
                  <dt>Group tour</dt>
                  <dd>
                    {money(rates.groupPerPersonCentavos)}{" "}
                    <small>per person</small>
                  </dd>
                </div>
              )}
              {agency.services.includes("PRIVATE_TOUR") && (
                <div>
                  <dt>Private tour</dt>
                  <dd>
                    {money(rates.privatePerPartyCentavos)}{" "}
                    <small>per party</small>
                  </dd>
                </div>
              )}
            </dl>
            <h3>Included</h3>
            <p className="preserve-lines">{rates.inclusions}</p>
            <h3>Excluded / additional charges</h3>
            <p className="preserve-lines">{rates.exclusions}</p>
          </section>
          <section className="profile-section">
            <h2>Before you plan</h2>
            <p>
              Approved policy version {agency.approvedRevision}. Read the
              agency’s requirements and conditions before making a request.
            </p>
            {(
              [
                ["Eligibility and documents", agency.policies.eligibility],
                ["Terms and conditions", agency.policies.terms],
                ["Cancellation", agency.policies.cancellation],
                ["Refund process", agency.policies.refund],
                ["Damage and deposit handling", agency.policies.damage],
                ["Late returns and no-shows", agency.policies.late],
              ] as const
            ).map(([title, text]) => (
              <details className="policy-disclosure" key={title}>
                <summary>{title}</summary>
                <p className="preserve-lines">{text}</p>
              </details>
            ))}
          </section>
        </div>
        <aside className="profile-contact">
          <h2>Contact the agency</h2>
          <a href={`mailto:${agency.contact.email}`}>
            <Mail size={17} />
            {agency.contact.email}
          </a>
          <a href={`tel:${agency.contact.phone.replace(/[^+0-9]/g, "")}`}>
            <Phone size={17} />
            {agency.contact.phone}
          </a>
          <h3>Customer support</h3>
          <p className="preserve-lines">{agency.contact.support}</p>
          <h3>Accepted payment methods</h3>
          <ul>
            {agency.acceptedMethods.map((m) => (
              <li key={m}>{methodLabels[m]}</li>
            ))}
          </ul>
          <p className="muted">
            Demo methods do not move money. Payment follows document review, an
            approved quote, and an agreement.
          </p>
        </aside>
      </div>
    </main>
  );
}
