"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Banknote, CreditCard, UserRound } from "lucide-react";
import type { AccountIdentity } from "@/modules/account/service";
import type { AccountPreferences } from "@/modules/account/preferences";

export function AccountProfile({ identity, initial, payment }: {
  identity: AccountIdentity;
  initial: AccountPreferences;
  payment: boolean;
}) {
  const [preferences, setPreferences] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const saving = useRef(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    const fields = new FormData(event.currentTarget);
    const selected = fields.get("preference");
    const preference = selected === "PAYMONGO" || selected === "AGENCY" ? selected : null;
    const profile = {
      phone: String(fields.get("phone") ?? "").trim(),
      emergencyContact: String(fields.get("emergencyContact") ?? "").trim(),
      address: String(fields.get("address") ?? "").trim(),
    };
    const body = payment ? {action:"PAYMENT", preference} : {action:"PROFILE", ...profile};
    saving.current = true;
    setBusy(true);
    setSaved(false);
    setError("");
    try {
      const response = await fetch("/api/account/preferences", {
        method: "PATCH",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const result = await response.json();
        throw Error(result.error || "Your changes could not be saved.");
      }
      setPreferences(value => payment ? {...value, preference} : {...value, ...profile});
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your changes could not be saved. Try again.");
    } finally {
      setBusy(false);
      saving.current = false;
    }
  }

  return <section className="figma-profile">
    <h1>{payment ? "Payment methods" : "Profile management"}</h1>
    <form className={payment ? "figma-panel figma-payment-preferences" : "figma-panel figma-profile-layout"} onSubmit={submit}>
      {!payment && <aside className="figma-profile-summary">
        <span className="avatar"><UserRound size={55} aria-hidden="true"/></span>
        <h2>{identity.name}</h2>
        <p>{identity.emailVerified ? "Verified email" : "Email verification pending"}</p>
        <p>Member since {new Intl.DateTimeFormat("en-PH", {month:"long", year:"numeric", timeZone:"Asia/Manila"}).format(new Date(initial.joined))}</p>
        <p className="figma-profile-count"><span>Completed bookings</span><strong>{initial.completed}</strong></p>
      </aside>}
      <div>
        <h2>{payment ? "Preferred payment method" : "Personal information"}</h2>
        <p>{payment ? "Save a preference. Each accepted quotation lists the methods available for that booking." : "Manage the contact details saved to your Rent2Go account."}</p>
        <fieldset disabled={busy}>
          {payment ? <div className="figma-method-options">
            <label><input type="radio" name="preference" value="PAYMONGO" defaultChecked={preferences.preference==="PAYMONGO"}/><CreditCard size={24} aria-hidden="true"/><span><strong>PayMongo</strong><small>Card and supported wallets in secure checkout</small></span></label>
            <label><input type="radio" name="preference" value="AGENCY" defaultChecked={preferences.preference==="AGENCY"}/><Banknote size={24} aria-hidden="true"/><span><strong>Agency payment</strong><small>Agency-approved cash or GCash where offered</small></span></label>
            <label><input type="radio" name="preference" value="" defaultChecked={preferences.preference===null}/><span>No preference</span></label>
          </div> : <div className="figma-profile-fields">
            <label>Full name<input value={identity.name} readOnly autoComplete="name"/></label>
            <label>Email address<input value={identity.email} readOnly type="email" autoComplete="email"/></label>
            <label>Phone number<input name="phone" type="tel" autoComplete="tel" maxLength={30} defaultValue={preferences.phone}/></label>
            <label>Emergency contact<input name="emergencyContact" maxLength={120} defaultValue={preferences.emergencyContact}/></label>
            <label>Delivery and billing address<textarea name="address" autoComplete="street-address" maxLength={400} rows={3} defaultValue={preferences.address}/></label>
          </div>}
          {payment ? <p>PayMongo handles payment credentials during checkout. Rent2Go stores the preference only.</p> :
            <p>Your phone can prefill new booking requests. Use <Link href="/workspace/account?section=privacy">Privacy &amp; requests</Link> to request a name correction.</p>}
          <div className="figma-profile-actions">
            <Link href="/workspace/account">Account settings</Link>
            <button type="reset" className="button secondary" onClick={()=>{setError("");setSaved(false);}}>Cancel edits</button>
            <button className="button">{busy ? "Saving…" : "Save changes"}</button>
          </div>
        </fieldset>
        {error && <p className="error-box" role="alert">{error}</p>}
        {saved && <p className="notice" role="status">Changes saved.</p>}
      </div>
    </form>
  </section>;
}
