import Link from "next/link";
import { notFound } from "next/navigation";
import { publicTour } from "@/modules/tours/service";
import { DomainError } from "@/modules/partners/workflow";
import { date, money } from "@/modules/partners/presentation";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const tour = await publicTour((await params).id).catch((e) => {
      if (e instanceof DomainError && e.status === 404) notFound();
      throw e;
    }),
    p = tour.payload;
  return (
    <main id="main-content" className="public-main agency-profile">
      <Link className="back-link" href="/tours">
        Explore tours
      </Link>
      <h1>{p.title}</h1>
      <p>
        {p.serviceArea} ·{" "}
        <Link href={`/agencies/${tour.agencyId}`}>{tour.agencyName}</Link> ·{" "}
        {p.mode === "GROUP" ? "Scheduled group tour" : "Exclusive private tour"}
      </p>
      <div className="vehicle-photo-grid">
        {tour.photos.map((photo) => (
          <img
            key={photo.id}
            src={`/api/tour-photos/${photo.id}`}
            width={600}
            height={400}
            alt={`${p.title}, supplied by ${tour.agencyName}`}
          />
        ))}
      </div>
      <div className="profile-layout">
        <div>
          <section className="context-section">
            <h2>About this experience</h2>
            <p className="preserve-lines">{p.description}</p>
            <h3>Itinerary</h3>
            <ol className="tour-itinerary">
              {p.itinerary.map((s, i) => (
                <li key={i}>
                  <h4>{s.title}</h4>
                  <p className="preserve-lines">{s.description}</p>
                </li>
              ))}
            </ol>
            <h3>Meeting point</h3>
            <p className="preserve-lines">{p.meetingPoint}</p>
            <h3>Included</h3>
            <p className="preserve-lines">{p.inclusions}</p>
            <h3>Excluded / additional charges</h3>
            <p className="preserve-lines">{p.exclusions}</p>
            <p>
              {p.transportIncluded
                ? "Operator transport is included."
                : "Transport is not included unless explicitly quoted."}{" "}
              This is a tour-only service; no vehicle is rented to the guest.
            </p>
          </section>
          <section className="context-section">
            <h2>
              Available {p.mode === "GROUP" ? "departures" : "private slots"}
            </h2>
            {!tour.schedules.length ? (
              <p>No upcoming dates are currently available.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Service dates (Manila)</th>
                      <th>Booking cutoff</th>
                      <th>Capacity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tour.schedules.map((s) => (
                      <tr key={s.id}>
                        <td>
                          {date(s.start_at)} to {date(s.end_at)}
                        </td>
                        <td>{date(s.cutoff_at)}</td>
                        <td>
                          {p.mode === "GROUP"
                            ? `${s.remaining_units} seats remaining`
                            : `${s.capacity} guests · ${s.remaining_units ? "one private slot available" : "reserved"}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p>
              Times are Manila (UTC+08:00). Availability is rechecked when an
              agency approves a booking.
            </p>
          </section>
          <section className="context-section">
            <h2>Requirements and policies</h2>
            {[
              ["Guest requirements", p.eligibilityTerms],
              ["Package terms", p.terms],
              ["Cancellation", p.cancellationPolicy],
              ["Refunds", p.refundPolicy],
            ].map(([label, text]) => (
              <details className="policy-disclosure" key={label}>
                <summary>{label}</summary>
                <p className="preserve-lines">{text}</p>
              </details>
            ))}
          </section>
        </div>
        <aside className="profile-contact">
          <h2>{money(p.priceCentavos)}</h2>
          <p>
            {p.mode === "GROUP"
              ? "Per person. Multiply by the number of guests."
              : "For the whole private party, charged once."}
          </p>
          <p>
            {p.minParty}–{p.maxParty} guests per booking; private dates may set
            a smaller party capacity.
          </p>
          <p>
            Booking requests and checkout are being completed. Contact the
            agency to discuss requirements; published unit prices are not an
            accepted final quotation.
          </p>
          <Link className="button" href={`/agencies/${tour.agencyId}`}>
            Agency terms and contacts
          </Link>
        </aside>
      </div>
    </main>
  );
}
