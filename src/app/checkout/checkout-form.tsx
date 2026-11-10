"use client";
import Link from "next/link";
import { useState } from "react";
import type { readCart } from "@/modules/cart/service";
export function CheckoutForm({
  cart,
  name,
  phone = "",
}: {
  cart: Awaited<ReturnType<typeof readCart>>;
  name: string;
  phone?: string;
}) {
  const [key] = useState(() => crypto.randomUUID()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<{ id: string; agencyName: string }[] | null>(
      null,
    );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const command = {
        idempotencyKey: key,
        cartVersion: cart.version,
        items: cart.groups
          .flatMap((g) => g.items)
          .map((i) => ({
            id: i.id,
            version: i.version,
            quoteDigest: i.savedQuote.digest,
          })),
        contact: {
          name: String(form.get("name")),
          phone: String(form.get("phone")),
          notes: String(form.get("notes") ?? ""),
        },
      };
      const res = await fetch("/api/booking-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(command),
        }),
        data = await res.json();
      if (!res.ok)
        throw Error(
          data.error || "Unable to submit. Your cart remains saved; try again.",
        );
      setResult(data.requests);
      window.dispatchEvent(new Event("rent2go:cart-changed"));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to submit. Your cart remains saved; try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (result)
    return (
      <section className="notice" role="status">
        <h2>Requests submitted</h2>
        <p>
          Requirements and agency review are pending. Inventory is not reserved
          and no payment was made.
        </p>
        <ul>
          {result.map((r) => (
            <li key={r.id}>
              <Link href={`/workspace/bookings/${r.id}`}>
                View your request to {r.agencyName}
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/workspace/bookings">View all your requests</Link>
      </section>
    );
  return (
    <form onSubmit={submit} className="form-panel">
      <fieldset className="cart-fields" disabled={busy}>
        <legend>Contact for these requests</legend>
        <label>
          Contact name
          <input
            name="name"
            autoComplete="name"
            required
            minLength={2}
            maxLength={160}
            defaultValue={name}
          />
        </label>
        <label>
          Phone number
          <input
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            minLength={7}
            maxLength={30}
            placeholder="+63…"
            defaultValue={phone}
          />
        </label>
        <label>
          Notes for your agencies · optional
          <textarea name="notes" maxLength={4000} rows={4} />
        </label>
        <p>
          Requirements, quotations, agreements and payment reviews follow
          submission. A rental request still needs the applicable
          identity/license checks; tour-only services follow their own guest
          requirements.
        </p>
        <button className="button" disabled={busy}>
          {busy
            ? "Submitting…"
            : `Submit ${cart.groups.length === 1 ? "booking request" : `${cart.groups.length} agency requests`}`}
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="notice">
          {error} <Link href="/cart">Review cart</Link> ·{" "}
          <Link href="/workspace/bookings">Check existing requests</Link>
        </p>
      )}
    </form>
  );
}
