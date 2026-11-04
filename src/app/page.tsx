import Link from "next/link";
import { ArrowRight, Car, Route, Building2 } from "lucide-react";
export default function Home() {
  return (
    <main id="main-content" className="public-main">
      <section className="hero">
        <div>
          <h1>
            Your next journey,
            <br />
            <em>with Rent2Go.</em>
          </h1>
          <p>
            A marketplace bringing car rentals, tours, and independent agencies
            together. Find the right service, understand the terms, and follow
            every step of your booking.
          </p>
          <Link className="button mint" href="/partners">
            Bring your agency on board <ArrowRight size={18} />
          </Link>
          <p className="hero-note">
            We’re building the marketplace. Agency partnership applications are
            now open in this demo.
          </p>
        </div>
        <div className="hero-side">
          <Car size={42} strokeWidth={1.4} />
          <h2>More ways to go.</h2>
          <ul>
            <li>Self-drive & with-driver rentals</li>
            <li>Scheduled group tours</li>
            <li>Private tour packages</li>
          </ul>
        </div>
      </section>
      <section className="public-section split-section">
        <div>
          <h2>
            A clear process,
            <br />
            from request to return.
          </h2>
          <p>
            Choose your service and dates. Your agency reviews requirements,
            prepares a quotation, and confirms the agreement and payment before
            handover.
          </p>
        </div>
        <div className="process-list">
          <div>
            <Car />
            <div>
              <h3>Rental services</h3>
              <p>
                Dates, vehicle requirements, agreed prices, and condition
                records.
              </p>
            </div>
          </div>
          <div>
            <Route />
            <div>
              <h3>Tours for your kind of trip</h3>
              <p>
                Join a scheduled departure or arrange a private experience for
                your party.
              </p>
            </div>
          </div>
          <div>
            <Building2 />
            <div>
              <h3>Agencies set their terms</h3>
              <p>
                Partner policies, pricing, and payment arrangements are reviewed
                before approval.
              </p>
            </div>
          </div>
        </div>
      </section>
      <section className="notice public-section">
        <h2>Marketplace catalog is in development</h2>
        <p>
          Approved agency profiles and reviewed vehicle partnerships are
          available. Tour browsing, booking requests, carts and checkout are
          still being built.
        </p>
        <Link className="text-link" href="/partners">
          See how agency partnership works <ArrowRight size={17} />
        </Link>
      </section>
    </main>
  );
}
