import Link from "next/link";
import { notFound } from "next/navigation";
import { publicTourDatesSchema, tourPrice } from "@/modules/tours/schema";
import { queryString, type RawFilters } from "@/modules/marketplace/filters";
import { publicTour } from "@/modules/tours/service";
import { DomainError } from "@/modules/partners/workflow";
import { date, money } from "@/modules/partners/presentation";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawFilters>;
}) {
  const raw = await searchParams,
    parsed = publicTourDatesSchema.safeParse({
      page: raw.page ?? 1,
      dateFrom: raw.dateFrom || undefined,
      dateTo: raw.dateTo || undefined,
      partySize: raw.partySize || undefined,
    }),
    query = parsed.success ? parsed.data : publicTourDatesSchema.parse({});
  const tour = await publicTour((await params).id, query).catch((e) => {
      if (e instanceof DomainError && e.status === 404) notFound();
      throw e;
    }),
    p = tour.payload;
  let partyMessage: string | null = null;
  if (query.partySize) {
    if (query.partySize < p.minParty || query.partySize > p.maxParty)
      partyMessage = `This package accepts ${p.minParty}–${p.maxParty} guests per booking.`;
    else
      try {
        partyMessage = `${query.partySize} guests · Whole-party service estimate: ${money(tourPrice(p, query.partySize).totalCentavos)}`;
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        partyMessage = `${error.message} Reduce the guest count or contact the agency.`;
      }
  }
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
      {!parsed.success && (
        <p role="alert" className="notice">
          Check departure dates and guest count. Showing all upcoming dates.
        </p>
      )}
      {partyMessage && <p className="notice">{partyMessage}</p>}
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
            <form action={`/tours/${tour.id}`} className="marketplace-form">
              <div className="marketplace-filter-grid">
                <label>
                  Departure from (Manila)
                  <input
                    type="date"
                    name="dateFrom"
                    defaultValue={query.dateFrom}
                  />
                </label>
                <label>
                  Departure through (Manila)
                  <input
                    type="date"
                    name="dateTo"
                    defaultValue={query.dateTo}
                  />
                </label>
                <label>
                  Guests
                  <input
                    type="number"
                    name="partySize"
                    min={p.minParty}
                    max={p.maxParty}
                    defaultValue={query.partySize}
                  />
                </label>
              </div>
              <button className="button secondary">
                Check departure dates
              </button>
            </form>
            <p>
              {tour.scheduleTotal} matching dates · Page {tour.page} of{" "}
              {tour.pageCount}
            </p>
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
            {tour.pageCount > 1 && (
              <nav className="pagination" aria-label="Available tour dates">
                {tour.page > 1 && (
                  <Link
                    href={`?${queryString({ ...query, page: tour.page - 1 })}`}
                  >
                    Previous
                  </Link>
                )}
                <span>
                  Page {tour.page} of {tour.pageCount}
                </span>
                {tour.page < tour.pageCount && (
                  <Link
                    href={`?${queryString({ ...query, page: tour.page + 1 })}`}
                  >
                    Next
                  </Link>
                )}
              </nav>
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
