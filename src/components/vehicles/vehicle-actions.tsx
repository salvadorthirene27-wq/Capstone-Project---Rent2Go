"use client";
import { useState } from "react";
import type { vehicleDetail } from "@/modules/vehicles/service";
type Offer = Awaited<ReturnType<typeof vehicleDetail>>;
export function VehicleActions({
  offer,
  dirty,
  onComplete,
  onBusyChange,
}: {
  offer: Pick<
    Offer,
    "id" | "state" | "ownership" | "version" | "revision" | "capabilities"
  >;
  dirty: boolean;
  onComplete: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [consent, setConsent] = useState(false),
    [reason, setReason] = useState("");
  const c = offer.capabilities;
  async function action(action: string) {
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      const r = await fetch(`/api/vehicles/${offer.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          version: offer.version,
          revision: offer.revision,
          reason,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "Unable to update this vehicle.");
      onComplete();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to update this vehicle. Try again.",
      );
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  const editable =
      c.isOwner && ["DRAFT", "CHANGES_REQUESTED"].includes(offer.state),
    accept =
      c.isOwner &&
      offer.ownership === "CONSIGNED" &&
      offer.state === "AGREEMENT_PENDING",
    review =
      (c.isAgency && offer.state === "SUBMITTED") ||
      (c.independentReviewer && offer.state === "COMPLIANCE_REVIEW"),
    withdraw =
      offer.state !== "WITHDRAWN" &&
      (c.isOwner || c.isAgency || c.independentReviewer);
  return (
    <section className="context-section vehicle-actions">
      <h2>Next step</h2>
      {dirty && <p role="status">Save your draft changes before continuing.</p>}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <fieldset disabled={busy || dirty}>
        {editable && (
          <button className="button" onClick={() => action("SUBMIT")}>
            {offer.ownership === "CONSIGNED"
              ? "Submit to agency"
              : "Submit for compliance review"}
          </button>
        )}
        {accept && (
          <>
            <label className="consent-row">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              I have reviewed and accept agreement version {offer.revision},
              including the rates, revenue shares, and terms shown above.
            </label>
            <button
              className="button"
              disabled={!consent}
              onClick={() => action("ACCEPT")}
            >
              Accept agreement version {offer.revision}
            </button>
          </>
        )}
        {review && (
          <>
            <label>
              Review reason
              <textarea
                value={reason}
                maxLength={2000}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain the decision and any corrections required."
              />
            </label>
            <div className="form-actions">
              {c.independentReviewer && (
                <button
                  className="button"
                  disabled={reason.trim().length < 10}
                  onClick={() => action("APPROVE")}
                >
                  Approve compliance
                </button>
              )}
              <button
                className="button secondary"
                disabled={reason.trim().length < 10}
                onClick={() => action("REQUEST_CHANGES")}
              >
                Request corrections
              </button>
              <button
                className="button secondary"
                disabled={reason.trim().length < 10}
                onClick={() => action("REJECT")}
              >
                Reject with reason
              </button>
            </div>
          </>
        )}
        {c.isAgency && offer.state === "APPROVED" && (
          <button className="button" onClick={() => action("PUBLISH")}>
            Publish approved vehicle
          </button>
        )}
        {c.isOwner &&
          ["APPROVED", "REJECTED", "WITHDRAWN"].includes(offer.state) && (
            <button
              className="button secondary"
              onClick={() => action("AMEND")}
            >
              Start a revised draft
            </button>
          )}
        {!editable && !accept && !review && offer.state !== "APPROVED" && (
          <p>
            {offer.state === "WITHDRAWN"
              ? "This vehicle is withdrawn. A revised submission, owner consent and compliance review are required before it returns to market."
              : "Waiting for the next reviewer. The submitted version is locked."}
          </p>
        )}
        {withdraw && (
          <details className="policy-disclosure">
            <summary>Withdraw this vehicle</summary>
            <p>
              Stop new publication or review. Existing history is retained.
              Returning to market requires a new reviewed submission.
            </p>
            <label>
              Withdrawal reason
              <textarea
                value={reason}
                maxLength={2000}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button
              className="button secondary"
              disabled={reason.trim().length < 10}
              onClick={() => action("UNPUBLISH")}
            >
              Withdraw vehicle
            </button>
          </details>
        )}
      </fieldset>
      {busy && <p role="status">Updating vehicle…</p>}
    </section>
  );
}
