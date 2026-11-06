import Link from "next/link";
import {
  ArrowRight,
  Check,
  FileText,
  ClipboardCheck,
  Store,
} from "lucide-react";
export const metadata = { title: "Become an agency partner" };
export default function Partners() {
  return (
    <main id="main-content" className="public-main">
      <section className="partner-intro">
        <div>
          <h1>
            Your agency.
            <br />A wider <em>road ahead.</em>
          </h1>
          <p>
            Bring your rentals and tours to Rent2Go. Tell us how you operate,
            set your pricing and terms, and choose the payment arrangements that
            work for your business.
          </p>
          <Link className="button" href="/workspace/application">
            Start your application <ArrowRight size={18} />
          </Link>
          <small>Already started? Sign in to continue your saved draft.</small>
        </div>
        <aside className="application-preview">
          <BuildingPreview />
          <h2>Make it your business.</h2>
          <ul className="check-list">
            {[
              "Your service areas and offerings",
              "Your terms and refund policies",
              "Flexible revenue-sharing agreements",
              "Renter and platform payment preferences",
            ].map((s) => (
              <li key={s}>
                <Check size={18} />
                {s}
              </li>
            ))}
          </ul>
          <div className="allocation-preview">
            <strong>Default consigned-vehicle allocation</strong>
            <div className="allocation-bar">
              <span style={{ width: "70%" }} />
              <span />
              <span />
              <span />
            </div>
            <p>
              70% Cosigner · 10% agency
              <br />
              10% Rent2Go · 10% maintenance
            </p>
            <small>Adjustable by agreement. Total must remain 100%.</small>
          </div>
        </aside>
      </section>
      <section className="public-section">
        <h2>A partnership with clear next steps.</h2>
        <ol className="partnership-steps">
          <li>
            <FileText />
            <h3>Complete your application</h3>
            <p>
              Save your business details, evidence, policies, rates, and payment
              preferences as you go.
            </p>
          </li>
          <li>
            <ClipboardCheck />
            <h3>Review and respond</h3>
            <p>
              Super Admin reviews your submitted version. If changes are needed,
              you receive a reason and can resubmit.
            </p>
          </li>
          <li>
            <Store />
            <h3>Prepare your services</h3>
            <p>
              Once approved, your agency can proceed to listing setup as that
              module becomes available.
            </p>
          </li>
        </ol>
      </section>
      <section className="public-section notice">
        <h2>What to have ready</h2>
        <p>
          Business registration or permit evidence, representative and contact
          information, service areas, operating terms, rates and deposits. For
          manual GCash, provide your business-owned account details and QR
          image.
        </p>
        <p>
          Agencies disclose their accepted payment methods and service terms.
          Renters review their quotation and agreement before paying.
        </p>
      </section>
    </main>
  );
}
function BuildingPreview() {
  return (
    <div className="partner-mark">
      <Store size={32} />
      <span>Agency partner application</span>
    </div>
  );
}
