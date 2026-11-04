import Link from "next/link";
import { pageActor } from "@/lib/page-actor";
import { readCart } from "@/modules/cart/service";
import { money, date } from "@/modules/partners/presentation";
import { CheckoutForm } from "./checkout-form";
export const dynamic = "force-dynamic";
export const metadata = { title: "Submit booking requests" };
export default async function Page() {
  const actor = await pageActor(),
    cart = await readCart(actor);
  return (
    <main id="main-content" className="public-main agency-profile">
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
          <p>
            Combined service estimate{" "}
            <strong>{money(cart.totals.serviceCentavos)}</strong> · Refundable
            deposits{" "}
            <strong>{money(cart.totals.refundableDepositCentavos)}</strong>.
            These amounts remain subject to agency review and your acceptance of
            the final quotation.
          </p>
          <CheckoutForm cart={cart} name={actor.name ?? ""} />
        </>
      )}
    </main>
  );
}
