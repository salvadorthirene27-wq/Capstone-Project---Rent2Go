"use client";
import { useEffect, useRef, useState } from "react";
import { CarFront } from "lucide-react";
import { useRouter } from "next/navigation";
import type { vehicleDetail } from "@/modules/vehicles/service";
import { VehicleFactsFields, VehicleTermsFields } from "./vehicle-fields";
import { VehicleSummary } from "./vehicle-summary";
import { VehicleActions } from "./vehicle-actions";
import { date } from "@/modules/partners/presentation";
type Detail = Awaited<ReturnType<typeof vehicleDetail>>;
export function VehicleEditor({ initial, compact = false }: { initial: Detail; compact?: boolean }) {
  const router = useRouter(),
    [facts, setFacts] = useState(initial.facts),
    [terms, setTerms] = useState(initial.terms),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [refreshing, setRefreshing] = useState(false),
    [actionBusy, setActionBusy] = useState(false),
    [error, setError] = useState("");
  const evidence = useRef<HTMLDetailsElement>(null);
  const editable =
      initial.capabilities.isOwner &&
      ["DRAFT", "CHANGES_REQUESTED"].includes(initial.state),
    proposal = initial.capabilities.isAgency && initial.state === "SUBMITTED";
  useEffect(() => {
    function before(e: BeforeUnloadEvent) {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    function navigate(e: MouseEvent) {
      const a = (e.target as HTMLElement).closest("a");
      if (
        dirty &&
        a &&
        a.target !== "_blank" &&
        !window.confirm("You have unsaved vehicle changes. Leave this page?")
      )
        e.preventDefault();
    }
    window.addEventListener("beforeunload", before);
    document.addEventListener("click", navigate);
    return () => {
      window.removeEventListener("beforeunload", before);
      document.removeEventListener("click", navigate);
    };
  }, [dirty]);
  async function request(url: string, body: unknown | FormData) {
    setBusy(true);
    setError("");
    try {
      const form = body instanceof FormData,
        r = await fetch(url, {
          method: "POST",
          ...(form ? {} : { headers: { "Content-Type": "application/json" } }),
          body: form ? body : JSON.stringify(body),
        });
      const data = await r.json();
      if (!r.ok)
        throw Error(
          data.issues
            ? data.issues
                .map(
                  (i: { path: string[]; message: string }) =>
                    `${i.path.join(".")}: ${i.message}`,
                )
                .join("; ")
            : data.error || "Unable to update this vehicle.",
        );
      setDirty(false);
      setRefreshing(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to finish. Try again.");
      setBusy(false);
    }
  }
  const photo = initial.files.find(f => f.is_current && f.purpose === "PHOTO");
  const VehicleTitle = compact ? "h3" : "h1";
  return (
    <div className={compact ? "vehicle-editor agency-vehicle-editor" : "vehicle-editor"}>
      {compact && <div className="agency-edit-preview">
        {photo ? <img src={`/api/vehicle-files/${photo.id}`} alt={initial.displayName}/> : <span className="agency-edit-no-photo"><CarFront size={36} aria-hidden="true"/>No vehicle photo</span>}
        <button className="button secondary" type="button" disabled={busy || actionBusy} onClick={() => {
          if (!evidence.current) return;
          evidence.current.open = true;
          evidence.current.querySelector("summary")?.focus();
        }}>{editable ? "Manage photos" : "View photos and evidence"}</button>
      </div>}
      <div className="page-title">
        <div>
          <VehicleTitle>
            {initial.displayName}
          </VehicleTitle>
          <p>
            Registration {initial.registration} ·{" "}
            {initial.ownership === "CONSIGNED"
              ? "Personally owned / consigned"
              : "Agency-owned"}
          </p>
        </div>
        <span className="status">
          {initial.state.replaceAll("_", " ").toLowerCase()}
        </span>
      </div>
      <p>
        Current agreement version {initial.revision} · draft version{" "}
        {initial.version}. {dirty && <strong>Unsaved changes</strong>}
      </p>
      {initial.viewMode === "SUBMITTED_SNAPSHOT" && (
        <p className="notice">
          Showing the last submitted agreement and evidence. Unsubmitted owner
          corrections remain private until resubmission.
        </p>
      )}
      {error && (
        <div className="notice" role="alert">
          <p>{error}</p>
          <button className="button secondary" onClick={() => router.refresh()}>
            Reload current version
          </button>
        </div>
      )}
      {refreshing && (
        <p role="status">
          Loading saved records…{" "}
          <button
            className="button secondary"
            onClick={() => window.location.reload()}
          >
            Reload saved records
          </button>
        </p>
      )}
      <fieldset disabled={busy || actionBusy} className="vehicle-editor-fields">
        <section className="context-section">
          <h2 className={compact && editable ? "sr-only" : undefined}>
            {editable
              ? "Vehicle and pricing"
              : proposal
                ? "Review vehicle and propose terms"
                : "Submitted vehicle and agreement"}
          </h2>
          {editable || proposal ? (
            <form
              onInvalidCapture={event => {
                const disclosure = (event.target as HTMLElement).closest("details");
                if (disclosure) disclosure.open = true;
              }}
              onSubmit={(e) => {
                e.preventDefault();
                request(
                  `/api/vehicles/${initial.id}`,
                  proposal
                    ? {
                        action: "PROPOSE",
                        version: initial.version,
                        revision: initial.revision,
                        terms,
                      }
                    : {
                        action: "SAVE",
                        version: initial.version,
                        payload: {
                          facts: {
                            ...facts,
                            features: facts.features
                              .map((f) => f.trim())
                              .filter(Boolean),
                          },
                          terms,
                        },
                      },
                );
              }}
            >
              {editable ? (
                <VehicleFactsFields
                  value={facts}
                  compact={compact}
                  onChange={(v) => {
                    setFacts(v);
                    setDirty(true);
                  }}
                />
              ) : (
                <VehicleSummary facts={facts} terms={initial.terms} />
              )}
              <h3 className={compact && editable ? "sr-only" : undefined}>
                {proposal
                  ? "Proposed owner–agency terms"
                  : "Rates and agreement defaults"}
              </h3>
              <VehicleTermsFields
                value={terms}
                compact={compact && editable}
                onChange={(v) => {
                  setTerms(v);
                  setDirty(true);
                }}
              />
              <button className="button" type="submit">
                {proposal
                  ? "Send proposal to vehicle owner"
                  : compact ? "Save Changes" : "Save vehicle draft"}
              </button>
              {proposal && (
                <p>
                  The owner must accept this exact proposal before platform
                  compliance review. Sending does not accept it on their behalf.
                </p>
              )}
            </form>
          ) : (
            <VehicleSummary facts={facts} terms={terms} />
          )}
        </section>
        {(() => {
          const content = <>
          <p>
            {initial.ownership === "CONSIGNED"
              ? "Submit your vehicle registration and driver's license. Vehicle photos are optional. Registration and license documents stay private."
              : "Ownership evidence stays private. Upload at least one vehicle photo before submitting."}
            {" "}Only approved photos can appear publicly. Maximum 8 MB per file and 10 current photos.
          </p>
          <ul className="vehicle-files">
            {initial.files
              .filter((f) => f.is_current)
              .map((f) => (
                <li key={f.id}>
                  <span>
                    <strong>
                      {f.purpose === "OWNERSHIP" ? "Vehicle registration" : f.purpose === "DRIVER_LICENSE" ? "Driver's license" : "Vehicle photo"}
                    </strong>
                    <a
                      target="_blank"
                      rel="noopener"
                      href={`/api/vehicle-files/${f.id}`}
                    >
                      {f.original_name}
                    </a>
                  </span>
                  {editable && (
                    <button
                      className="button secondary small"
                      disabled={dirty}
                      onClick={() =>
                        request(`/api/vehicles/${initial.id}`, {
                          action: "REMOVE_FILE",
                          version: initial.version,
                          fileId: f.id,
                        })
                      }
                    >
                      Remove from draft
                    </button>
                  )}
                </li>
              ))}
          </ul>
          {!initial.files.some((f) => f.is_current) && (
            <p>No files uploaded yet.</p>
          )}
          {editable && (
            <form
              className="vehicle-upload"
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                data.set("version", String(initial.version));
                request(`/api/vehicles/${initial.id}/files`, data);
              }}
            >
              <label>
                Evidence purpose
                <select name="purpose" defaultValue={compact ? "PHOTO" : "OWNERSHIP"}>
                  <option value="OWNERSHIP">
                    Vehicle registration
                  </option>
                  {initial.ownership === "CONSIGNED" && <option value="DRIVER_LICENSE">Driver's license</option>}
                  <option value="PHOTO">Vehicle photo (PNG or JPEG)</option>
                </select>
              </label>
              <label>
                Choose file
                <input
                  required
                  name="file"
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  disabled={dirty}
                />
              </label>
              <button
                className="button secondary"
                type="submit"
                disabled={dirty}
              >
                Upload file
              </button>
              {dirty && <p>Save draft changes before uploading.</p>}
            </form>
          )}
          </>;
          return compact
            ? <details className="agency-edit-extra" ref={evidence}><summary>Ownership evidence and vehicle photos</summary>{content}</details>
            : <section className="context-section"><h2>Ownership evidence and vehicle photos</h2>{content}</section>;
        })()}
        <VehicleActions
          offer={initial}
          dirty={dirty}
          onBusyChange={setActionBusy}
          onComplete={() => {
            setBusy(true);
            setRefreshing(true);
            setDirty(false);
            router.refresh();
          }}
        />
      </fieldset>
      {busy && <p role="status">Saving vehicle changes…</p>}
      {!compact && <><section className="context-section">
        <h2>Submitted versions and consent</h2>
        {!initial.revisions.length && <p>No submitted versions yet.</p>}
        {initial.revisions.map((r) => (
          <details className="policy-disclosure" key={r.revision}>
            <summary>
              Agreement version {r.revision} · {date(r.created_at)}
            </summary>
            <VehicleSummary facts={r.facts} terms={r.terms} />
            <p>Approved agency policy version {r.agency_policy_revision}</p>
            <p className="digest">Agreement fingerprint: {r.digest}</p>
            {initial.agreements
              .filter((a) => a.revision === r.revision)
              .map((a) => (
                <p key={a.revision}>
                  Owner accepted this exact version on {date(a.accepted_at)}.
                </p>
              ))}
            <ul>
              {r.files.map(
                (f: { id: string; purpose: string; original_name: string }) => (
                  <li key={f.id}>
                    <a
                      target="_blank"
                      rel="noopener"
                      href={`/api/vehicle-files/${f.id}`}
                    >
                      {f.purpose.toLowerCase()}: {f.original_name}
                    </a>
                  </li>
                ),
              )}
            </ul>
          </details>
        ))}
      </section>
      <section className="context-section">
        <h2>Review and publication history</h2>
        {!initial.events.length && <p>No decisions recorded yet.</p>}
        <ol className="vehicle-history">
          {initial.events.map((e, i) => (
            <li key={i}>
              <strong>{e.action.replaceAll("_", " ").toLowerCase()}</strong> ·
              version {e.revision}
              <small>{date(e.created_at)}</small>
              {e.reason && <p className="preserve-lines">{e.reason}</p>}
            </li>
          ))}
        </ol>
      </section></>}
    </div>
  );
}
