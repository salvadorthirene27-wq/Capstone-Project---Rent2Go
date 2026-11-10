import type { getBookingRequest } from "@/modules/bookings/service";
import { money, date } from "@/modules/partners/presentation";
import {BookingJourney} from "./booking-journey";
const policyLabels: Record<string, string> = {
  eligibilityTerms: "Eligibility",
  terms: "Service terms",
  cancellationPolicy: "Cancellation",
  refundPolicy: "Refunds",
  damagePolicy: "Damage and deposit",
  latePolicy: "Late returns and no-shows",
  inclusions: "Included",
  exclusions: "Excluded",
};
export function BookingDetail({
  booking,
}: {
  booking: Awaited<ReturnType<typeof getBookingRequest>>;
}) {
  return (
    <>
      <h1>Booking request</h1>
      {booking.paymentEnvironment==="DEMO"&&<p className="notice"><strong>Simulated payment · no charge</strong></p>}
      <p>
        {booking.agencyName} · Submitted {date(booking.createdAt)}
      </p>
      <BookingJourney status={booking.status}/>
      <p className="notice">
        Check the next step above to continue. Your quotation shows its reservation
        expiry; service release requires approval, a signed agreement, confirmed
        payment and the required delivery checks.
      </p>
      <div className="figma-checkout-columns"><div>
      <section className="context-section">
        <h2>Contact details</h2>
        <p>
          {booking.contact.name}
          <br />
          {booking.contact.email}
          <br />
          {booking.contact.phone}
        </p>
        {booking.contact.notes && (
          <p className="preserve-lines">{booking.contact.notes}</p>
        )}
      </section>
      {booking.lines.map((line) => (
        <section className="context-section" key={line.id}>
          <h2>{line.quote.title}</h2>
          <p>
            {date(line.quote.startAt)} – {date(line.quote.endAt)} ·{" "}
            {line.quote.selection.partySize} guests
          </p>
          <p>
            Submitted service estimate:{" "}
            {money(line.quote.estimate.serviceCentavos)} · Refundable deposit:{" "}
            {money(line.quote.estimate.refundableDepositCentavos)}
          </p>
          <p>
            Listing revision {line.quote.sourceRevision} · Agency policy
            revision {line.quote.policyRevision}
          </p>
          <details>
            <summary>Policies saved with this request</summary>
            {Object.entries(policyLabels).map(([key, label]) => (
              <p className="preserve-lines" key={key}>
                <strong>{label}</strong>
                <br />
                {String(line.policy[key] ?? "")}
              </p>
            ))}
          </details>
        </section>
      ))}
      </div>
      <section className="cart-totals figma-panel figma-checkout-summary">
        <h2>Submitted estimates</h2>
        <p>
          Services {money(booking.totals.serviceCentavos)}
          <br />
          Refundable deposits {money(booking.totals.refundableDepositCentavos)}
          <br />
          Estimated total {money(booking.totals.estimatedDueCentavos)}
        </p>
        <p>These are submitted estimates. The quotation, agreement and payment records below show accepted amounts and the current balance.</p>
      </section>
      </div>
      <details id="booking-history" className="context-section booking-history">
        <summary>Booking history · {booking.events.length} updates</summary>
        <ol>
          {booking.events.map((event) => (
            <li key={event.id}>
              {event.message} <small>{date(String(event.created_at))}</small>
            </li>
          ))}
        </ol>
      </details>
    </>
  );
}
