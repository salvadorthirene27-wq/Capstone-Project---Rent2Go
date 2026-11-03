"use client";
import Link from "next/link";
import { useState } from "react";
import { ApplicationSummary } from "@/components/application-summary";
import type { getApplication } from "@/modules/partners/service";
import { statusLabel, date } from "@/modules/partners/presentation";
export function Review({
  initial,
}: {
  initial: Awaited<ReturnType<typeof getApplication>>;
}) {
  const [app, setApp] = useState(initial),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function decide(action: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/partners/${app.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, version: app.version, reason }),
        }),
        body = await r.json();
      if (!r.ok) throw Error(body.error);
      const updated = await fetch(`/api/partners/${app.id}`);
      if (!updated.ok)
        throw Error(
          "Decision recorded, but unable to reload. Refresh this page.",
        );
      setApp(await updated.json());
      setConfirmed(false);
      setReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to review. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <Link className="text-link" href="/admin">
        Back to partner reviews
      </Link>
      <div className="page-title">
        <div>
          <h1>{app.payload.businessName || "Agency application"}</h1>
          <p>
            Submitted revision {app.submittedRevision} · saved version{" "}
            {app.version}
          </p>
        </div>
        <span
          className={`status ${app.status === "APPROVED" ? "approved" : ""}`}
        >
          {statusLabel(app.status)}
        </span>
      </div>
      <ApplicationSummary payload={app.payload} />
      <section className="document-field">
        <h2>Current private supporting evidence</h2>
        <p>
          Uploading a replacement supersedes the earlier file for future
          submissions. Prior submitted versions retain their original evidence
          below.
        </p>
        {app.files.length ? (
          <ul className="file-list">
            {app.files.map((f) => (
              <li key={f.id}>
                <div>
                  <strong>{f.purpose.replaceAll("_", " ")}</strong>
                  <a
                    href={`/api/evidence/${f.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {f.original_name}
                  </a>
                </div>
                <small>{Math.ceil(f.size_bytes / 1024)} KB</small>
              </li>
            ))}
          </ul>
        ) : (
          <p>No evidence uploaded.</p>
        )}
      </section>
      {["SUBMITTED", "UNDER_REVIEW"].includes(app.status) && (
        <section className="review-controls">
          <h2>Review decision</h2>
          <p>
            Inspect the evidence and each policy. Approval is your
            administrative decision; no automatic authenticity verification is
            performed.
          </p>
          {app.status === "SUBMITTED" && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => decide("START_REVIEW")}
            >
              Mark under review
            </button>
          )}
          <label className="consent">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              I reviewed the submitted details, evidence, pricing, and payment
              arrangements.
            </span>
          </label>
          <label className="field">
            Decision reason / requested corrections
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={4000}
              minLength={5}
              rows={4}
            />
          </label>
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          <div className="decision-buttons">
            <button
              className="button"
              disabled={busy || !confirmed || reason.trim().length < 5}
              onClick={() => decide("APPROVE")}
            >
              Approve agency
            </button>
            <button
              className="button secondary"
              disabled={busy || !confirmed || reason.trim().length < 5}
              onClick={() => decide("CHANGES_REQUESTED")}
            >
              Request changes
            </button>
            <button
              className="button danger"
              disabled={busy || !confirmed || reason.trim().length < 5}
              onClick={() => decide("REJECT")}
            >
              Reject application
            </button>
          </div>
        </section>
      )}
      <section className="history">
        <h2>Review history</h2>
        {app.reviews.length ? (
          app.reviews.map((r, i) => (
            <div className="history-entry" key={i}>
              <strong>
                {statusLabel(r.decision)} · revision {r.revision}
              </strong>
              <p>{r.reason}</p>
              <small>{date(r.created_at)}</small>
            </div>
          ))
        ) : (
          <p className="muted">No decisions yet.</p>
        )}
        {app.revisions.map((r) => (
          <details key={r.revision}>
            <summary>
              Submitted revision {r.revision} · {date(r.submitted_at)}
            </summary>
            <ApplicationSummary payload={r.payload} />
            <h3>Evidence in this submission</h3>
            <ul>
              {r.files.map((f) => (
                <li key={f.id}>
                  <a
                    href={`/api/evidence/${f.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {f.purpose}: {f.original_name}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </section>
    </div>
  );
}
