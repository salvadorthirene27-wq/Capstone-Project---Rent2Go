"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { readCart, CartLine } from "@/modules/cart/service";
import { money, date } from "@/modules/partners/presentation";
import { CartSelection } from "@/components/cart-selection";
function Line({ line }: { line: CartLine }) {
  const router = useRouter(),
    [edit, setEdit] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const q = line.savedQuote,
    source =
      q.selection.kind === "RENTAL"
        ? `/cars/${q.selection.offerId}`
        : `/tours/${q.selection.tourId}`;
  const limits = (line.currentQuote ?? q).constraints;
  async function remove() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/cart/${line.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "REMOVE", version: line.version }),
        }),
        data = await res.json();
      if (!res.ok)
        throw Error(data.error || "Unable to remove this item. Try again.");
      window.dispatchEvent(new Event("rent2go:cart-changed"));
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to remove this item. Try again.",
      );
      setBusy(false);
    }
  }
  return (
    <article className="cart-line">
      <div>
        <h3>
          <Link href={source}>{q.title}</Link>
        </h3>
        <p>
          {date(q.startAt)} – {date(q.endAt)} · {q.selection.partySize} guests
          {q.selection.kind === "RENTAL"
            ? ` · ${q.selection.mode === "SELF_DRIVE" ? "Self-drive" : "With driver"}`
            : q.priceUnit === "PER_PERSON"
              ? " · Per-person tour"
              : " · Private party"}
        </p>
        <p>
          Saved service estimate:{" "}
          <strong>{money(q.estimate.serviceCentavos)}</strong> · Refundable
          deposit: {money(q.estimate.refundableDepositCentavos)}
        </p>
        {line.status !== "CURRENT" && (
          <p className="notice" role="status">
            {line.reason}
            {line.currentQuote && (
              <>
                {" "}
                Current service estimate:{" "}
                <strong>
                  {money(line.currentQuote.estimate.serviceCentavos)}
                </strong>
                .
              </>
            )}
          </p>
        )}
        <div className="page-navigation">
          <button
            className="button secondary small"
            disabled={busy}
            onClick={() => setEdit(!edit)}
          >
            {edit ? "Close editor" : "Edit / review estimate"}
          </button>
          <button className="link-button" disabled={busy} onClick={remove}>
            {busy ? "Removing…" : "Remove"}
          </button>
        </div>
        {error && (
          <p role="alert">
            {error}{" "}
            <button className="link-button" onClick={() => router.refresh()}>
              Reload cart
            </button>
          </p>
        )}
        {edit && (
          <CartSelection
            initial={line.selection}
            minParty={limits.minParty}
            maxParty={limits.maxParty}
            modes={limits.modes}
            item={{ id: line.id, version: line.version }}
            onSaved={() => {
              setEdit(false);
              router.refresh();
            }}
          />
        )}
      </div>
    </article>
  );
}
export function CartEditor({
  cart,
}: {
  cart: Awaited<ReturnType<typeof readCart>>;
}) {
  if (!cart.totalItems)
    return (
      <section className="figma-panel">
        <h2>Plan your next journey</h2>
        <p>
          Your cart is empty. Select dates and guests on a listing, review its
          estimate, then add it here.
        </p>
        <Link className="button" href="/rentals">
          Explore car rentals
        </Link>{" "}
        <Link className="button secondary" href="/tours">
          Explore tours
        </Link>
      </section>
    );
  return (
    <div className="figma-checkout-columns figma-cart-columns">
      <div className="figma-cart-groups">
        {cart.groups.map((g) => (
          <section className="figma-panel" key={g.agencyId}>
            <h2>
              <Link href={`/agencies/${g.agencyId}`}>{g.name}</Link>
            </h2>
            {g.items.map((line) => (
              <Line key={`${line.id}:${line.version}`} line={line} />
            ))}
          </section>
        ))}
      </div>
      <section className="figma-panel figma-checkout-summary">
        <h2>Saved estimates</h2>
        <dl className="payment-totals">
          <div>
            <dt>Service subtotal</dt>
            <dd>{money(cart.totals.serviceCentavos)}</dd>
          </div>
          <div>
            <dt>Refundable deposits</dt>
            <dd>{money(cart.totals.refundableDepositCentavos)}</dd>
          </div>
          <div>
            <dt>Estimated total</dt>
            <dd>{money(cart.totals.estimatedDueCentavos)}</dd>
          </div>
        </dl>
        {!cart.readyToRequest && (
          <p role="status">
            Review the changed or unavailable items above before continuing.
          </p>
        )}
        <p>
          Request submission shares your selections with the agencies for
          review. It does not reserve inventory or collect payment.
        </p>
        {cart.readyToRequest && (
          <Link className="button figma-summary-action" href="/checkout">
            Review booking requests
          </Link>
        )}
      </section>
    </div>
  );
}
