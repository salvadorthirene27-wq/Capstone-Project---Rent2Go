import { accountPreferences } from "@/modules/account/preferences";
import { Workspace } from "@/components/workspace";
import Link from "next/link";
import { pageActor } from "@/lib/page-actor";
import { readCart } from "@/modules/cart/service";
import { money, date } from "@/modules/partners/presentation";
import { CheckoutForm } from "./checkout-form";
export const dynamic = "force-dynamic";
export const metadata = { title: "Submit booking requests" };
export default async function Page() {
  const actor = await pageActor();
  const [cart, profile] = await Promise.all([readCart(actor), accountPreferences(actor)]);
  return (
    <Workspace actor={actor}><section className="checkout-page figma-checkout">
      <Link className="back-link" href="/cart">
        Back to your cart
      </Link>
      <h1>Review your booking requests</h1>
      {!cart.totalItems ? (
        <p>
          Your cart is empty. <Link href="/rentals">Explore rentals</Link> or{" "}
          <Link href="/tours">find a tour</Link>.
        </p>
      ) : !cart.readyToRequest ? (
        <p role="alert" className="notice">
          Some selections changed or are unavailable.{" "}
          <Link href="/cart">Review your cart</Link> before submitting.
        </p>
      ) : (
        <>
          <p>
            Your contact details will be shared with the agencies below. Each
            agency receives its own request. This step does not reserve
            inventory, confirm a booking, accept a final quotation or collect
            payment.
          </p>
          <div className="figma-checkout-columns">
          <div>
          {cart.groups.map((g) => (
            <section className="context-section" key={g.agencyId}>
              <h2>{g.name}</h2>
              {g.items.map((line) => (
                <div className="cart-line" key={line.id}>
                  <h3>{line.savedQuote.title}</h3>
                  <p>
                    {date(line.savedQuote.startAt)} –{" "}
                    {date(line.savedQuote.endAt)} · {line.selection.partySize}{" "}
                    guests
                  </p>
                  <p>
                    Service estimate{" "}
                    {money(line.savedQuote.estimate.serviceCentavos)} ·
                    Refundable deposit{" "}
                    {money(line.savedQuote.estimate.refundableDepositCentavos)}
                  </p>
                </div>
              ))}
            </section>
          ))}
          <CheckoutForm cart={cart} name={actor.name ?? ""} phone={profile.phone} />
          </div>
          <aside className="figma-panel figma-checkout-summary">
            <h2>Reservation order overview</h2>
            <dl className="payment-totals">
              <div><dt>Saved services</dt><dd>{cart.totalItems}</dd></div>
              <div><dt>Combined service estimate</dt><dd>{money(cart.totals.serviceCentavos)}</dd></div>
              <div><dt>Refundable deposits</dt><dd>{money(cart.totals.refundableDepositCentavos)}</dd></div>
              <div><dt>Estimated total</dt><dd>{money(cart.totals.estimatedDueCentavos)}</dd></div>
            </dl>
            <p>Review the agency’s final quotation and agreement before payment.</p>
          </aside>
          </div>
        </>
      )}
    </section></Workspace>
  );
}
