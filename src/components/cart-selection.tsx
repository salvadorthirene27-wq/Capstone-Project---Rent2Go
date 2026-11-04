"use client";
import Link from "next/link";
import { useState } from "react";
import { manilaInputToIso } from "@/lib/manila-time";
import { money, date } from "@/modules/partners/presentation";
import type { Selection } from "@/modules/cart/schema";
import type { CartQuote } from "@/modules/cart/pricing";
export type CartSchedule = { id: string; startAt: string; endAt: string };
const localTime = (value: string) =>
  new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 16);
export function CartSelection({
  initial,
  modes = ["SELF_DRIVE", "WITH_DRIVER"],
  schedules = [],
  minParty = 1,
  maxParty = 50,
  item,
  onSaved,
}: {
  initial: Selection;
  modes?: ("SELF_DRIVE" | "WITH_DRIVER")[];
  schedules?: CartSchedule[];
  minParty?: number;
  maxParty?: number;
  item?: { id: string; version: number };
  onSaved?: () => void;
}) {
  const [party, setParty] = useState(initial.partySize),
    [mode, setMode] = useState(
      initial.kind === "RENTAL" ? initial.mode : "SELF_DRIVE",
    );
  const [start, setStart] = useState(
      initial.kind === "RENTAL" ? localTime(initial.startAt) : "",
    ),
    [end, setEnd] = useState(
      initial.kind === "RENTAL" ? localTime(initial.endAt) : "",
    );
  const [schedule, setSchedule] = useState(
    initial.kind === "TOUR" ? initial.scheduleId : "",
  );
  const [quote, setQuote] = useState<CartQuote | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [login, setLogin] = useState(false);
  function changed() {
    setQuote(null);
    setSaved(false);
    setError("");
  }
  async function preview(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setQuote(null);
    setBusy(true);
    setLogin(false);
    try {
      const selection: Selection =
        initial.kind === "RENTAL"
          ? {
              kind: "RENTAL",
              offerId: initial.offerId,
              startAt: manilaInputToIso(start),
              endAt: manilaInputToIso(end),
              mode,
              partySize: party,
            }
          : {
              kind: "TOUR",
              tourId: initial.tourId,
              scheduleId: schedule,
              partySize: party,
            };
      const res = await fetch("/api/cart/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(selection),
        }),
        data = await res.json();
      if (!res.ok) {
        setLogin(res.status === 401);
        throw Error(data.error || "Unable to check this selection. Try again.");
      }
      setQuote(data);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to check this selection. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!quote) return;
    setBusy(true);
    setError("");
    try {
      const payload = { selection: quote.selection, quoteDigest: quote.digest };
      const res = await fetch(item ? `/api/cart/${item.id}` : "/api/cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            item
              ? { action: "UPDATE", version: item.version, payload }
              : payload,
          ),
        }),
        data = await res.json();
      if (!res.ok)
        throw Error(data.error || "Unable to save your cart. Try again.");
      setSaved(true);
      setQuote(null);
      window.dispatchEvent(new Event("rent2go:cart-changed"));
      onSaved?.();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to save your cart. Try again.",
      );
      setQuote(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="cart-selection">
      <form onSubmit={preview}>
        <fieldset disabled={busy} className="cart-fields">
          <legend>
            {item ? "Change your selection" : "Choose your service"}
          </legend>
          {initial.kind === "RENTAL" ? (
            <>
              <label>
                Pickup · Manila
                <input
                  required
                  type="datetime-local"
                  value={start}
                  onChange={(e) => {
                    setStart(e.target.value);
                    changed();
                  }}
                />
              </label>
              <label>
                Return · Manila
                <input
                  required
                  type="datetime-local"
                  value={end}
                  onChange={(e) => {
                    setEnd(e.target.value);
                    changed();
                  }}
                />
              </label>
              <label>
                Rental mode
                <select
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value as typeof mode);
                    changed();
                  }}
                >
                  {modes.map((m) => (
                    <option value={m} key={m}>
                      {m === "SELF_DRIVE" ? "Self-drive" : "With driver"}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : schedules.length > 0 ? (
            <label>
              Departure · Manila
              <select
                required
                value={schedule}
                onChange={(e) => {
                  setSchedule(e.target.value);
                  changed();
                }}
              >
                {schedules.map((s) => (
                  <option key={s.id} value={s.id}>
                    {date(s.startAt)} – {date(s.endAt)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p>
              To choose a different departure, open the tour listing and replace
              this item.
            </p>
          )}
          <label>
            Guests
            <input
              required
              type="number"
              min={minParty}
              max={maxParty}
              value={party}
              onChange={(e) => {
                setParty(Number(e.target.value));
                changed();
              }}
            />
          </label>
          <button className="button secondary" disabled={busy}>
            {busy ? "Checking…" : "Review current estimate"}
          </button>
        </fieldset>
      </form>
      {error && (
        <p role="alert" className="notice">
          {error}
          {login && (
            <>
              {" "}
              <Link href="/login">Sign in or create an account</Link> to use
              your cart.
            </>
          )}
        </p>
      )}
      {quote && (
        <div className="cart-estimate" aria-live="polite">
          <h3>Review this estimate</h3>
          <p>
            Service: <strong>{money(quote.estimate.serviceCentavos)}</strong>
            <br />
            Refundable deposit:{" "}
            {money(quote.estimate.refundableDepositCentavos)}
            <br />
            Estimated total:{" "}
            <strong>{money(quote.estimate.estimatedDueCentavos)}</strong>
          </p>
          <p>
            Review{" "}
            <Link href={`/agencies/${quote.agencyId}`}>
              {quote.agencyName}’s policies
            </Link>{" "}
            (revision {quote.policyRevision}) and this listing’s terms (revision{" "}
            {quote.sourceRevision}). Agency review and a final quotation are
            still required.
          </p>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={save}
          >
            {busy
              ? "Saving…"
              : item
                ? "Save reviewed selection"
                : "Add to cart"}
          </button>
        </div>
      )}
      {saved && (
        <p role="status" className="notice">
          {item ? "Cart item updated." : "Added to your cart."}{" "}
          <Link href="/cart">View cart</Link>
        </p>
      )}
      <p className="muted">
        Your cart saves selections and estimates. It does not reserve inventory
        or collect payment.
      </p>
    </div>
  );
}
