"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Save, FileUp } from "lucide-react";
import { ApplicationSummary } from "@/components/application-summary";
import {ExtraChargePolicyEditor} from "@/components/extra-charge-policies";
import { driverFeeUnitLabels } from "@/modules/pricing/units";
import {
  serviceOptions,
  paymentOptions,
  type ApplicationInput,
} from "@/modules/partners/schema";
import {
  steps,
  fieldLabels,
  businessFields,
  termFields,
  serviceLabels,
  methodLabels,
  statusLabel,
  date,
} from "@/modules/partners/presentation";
import type { getApplication } from "@/modules/partners/service";
type Detail = Awaited<ReturnType<typeof getApplication>>;
type Issue = { path: PropertyKey[]; message: string };
export function PartnerForm({ initial }: { initial: Detail }) {
  const [app, setApp] = useState(initial),
    [data, setData] = useState(initial.payload),
    [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [issues, setIssues] = useState<Issue[]>([]);
  const editable = ["DRAFT", "CHANGES_REQUESTED"].includes(app.status);
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
        !window.confirm("You have unsaved changes. Leave this page?")
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
  function update<K extends keyof ApplicationInput>(
    key: K,
    value: ApplicationInput[K],
  ) {
    setData((p) => ({ ...p, [key]: value }));
    setDirty(true);
    setNotice("");
  }
  async function response(r: Response) {
    const body = await r.json();
    if (!r.ok) {
      setIssues(body.issues || []);
      throw Error(body.error || "Unable to save. Try again.");
    }
    return body;
  }
  async function refresh() {
    const latest = await response(await fetch(`/api/partners/${app.id}`));
    setApp(latest);
    setData(latest.payload);
    setDirty(false);
  }
  async function command(
    action: string,
    version: number,
    payload?: ApplicationInput,
  ) {
    return response(
      await fetch(`/api/partners/${app.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          version,
          ...(payload ? { payload } : {}),
        }),
      }),
    );
  }
  async function save() {
    const latest = await command("SAVE", app.version, data);
    setApp((p) => ({ ...p, ...latest }));
    setData(latest.payload);
    setDirty(false);
    setNotice("Draft saved.");
    return latest;
  }
  async function act(
    action: "SAVE" | "SUBMIT" | "WITHDRAW" | "AMEND",
    next?: number,
  ) {
    setBusy(true);
    setError("");
    setIssues([]);
    try {
      if (action === "AMEND") {
        await command(action, app.version);
        await refresh();
        setStep(0);
        setNotice(
          "Policy revision started. Your previous approved version stays effective until the new version is approved.",
        );
      } else if (action === "WITHDRAW") {
        if (
          !window.confirm(
            "Withdraw this application? It will no longer be available for review.",
          )
        )
          return;
        await command(action, app.version);
        await refresh();
      } else {
        const latest = await save();
        if (action === "SUBMIT") {
          await command("SUBMIT", latest.version);
          await refresh();
          setNotice(
            "Application submitted. You’ll see the review outcome here.",
          );
        } else if (next !== undefined) {
          setStep(next);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Connection failed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function upload(
    e: React.ChangeEvent<HTMLInputElement>,
    purpose: string,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const latest = await save(),
        form = new FormData();
      form.set("file", file);
      form.set("purpose", purpose);
      form.set("version", String(latest.version));
      await response(
        await fetch(`/api/partners/${app.id}/evidence`, {
          method: "POST",
          body: form,
        }),
      );
      await refresh();
      setNotice("Private document uploaded.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Upload failed. Try again.",
      );
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }
  const fieldError = (key: string) =>
    issues.find((i) => i.path.join(".") === key)?.message;
  function field(key: keyof ApplicationInput, multiline = false) {
    const id = String(key),
      err = fieldError(id),
      label = fieldLabels[key] || id;
    return (
      <label
        className={multiline ? "field full" : "field"}
        key={id}
        htmlFor={id}
      >
        {label}
        {multiline ? (
          <textarea
            id={id}
            value={String(data[key])}
            rows={key === "terms" ? 7 : 3}
            maxLength={8000}
            aria-invalid={!!err}
            aria-describedby={err ? `${id}-error` : undefined}
            onChange={(e) => update(key, e.target.value as never)}
          />
        ) : (
          <input
            id={id}
            type={key === "email" ? "email" : key === "phone" ? "tel" : "text"}
            maxLength={200}
            value={String(data[key])}
            aria-invalid={!!err}
            aria-describedby={err ? `${id}-error` : undefined}
            onChange={(e) => update(key, e.target.value as never)}
          />
        )}{" "}
        {err && (
          <small className="field-error" id={`${id}-error`}>
            {err}
          </small>
        )}
      </label>
    );
  }
  function numberField(
    key:
      | "dailyRateCentavos"
      | "depositCentavos"
      | "driverFeeCentavos"
      | "perPersonCentavos"
      | "perPartyCentavos"
      | "holdHours"
      | "bufferMinutes",
  ) {
    const monetary = key.endsWith("Centavos"),
      value = data[key],
      err = fieldError(key);
    return (
      <label className="field" htmlFor={key} key={key}>
        {fieldLabels[key]}
        <input
          id={key}
          type="number"
          min={0}
          step={monetary ? "0.01" : "1"}
          value={value === null ? "" : monetary ? value / 100 : value}
          onChange={(e) =>
            update(
              key,
              e.target.value === ""
                ? null
                : monetary
                  ? Math.round(Number(e.target.value) * 100)
                  : Number(e.target.value),
            )
          }
          aria-invalid={!!err}
        />
        {err && <small className="field-error">{err}</small>}
      </label>
    );
  }
  function documents(
    purpose: "REGISTRATION" | "PERMIT" | "GCASH_QR",
    title: string,
  ) {
    return (
      <div className="document-field">
        <h3>{title}</h3>
        <p className="muted">
          Private upload ·{" "}
          {purpose === "GCASH_QR" ? "PNG or JPEG" : "PDF, PNG or JPEG"} · up to
          8 MB
        </p>
        <ul className="file-list">
          {app.files
            .filter((f) => f.purpose === purpose)
            .map((f) => (
              <li key={f.id}>
                <a
                  href={`/api/evidence/${f.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {f.original_name}
                </a>
                <small>{Math.ceil(f.size_bytes / 1024)} KB</small>
              </li>
            ))}
        </ul>
        {editable && (
          <label className="upload-control">
            <FileUp size={18} />
            Choose {purpose === "GCASH_QR" ? "QR image" : "document"}
            <input
              aria-label={`Upload ${title}`}
              type="file"
              accept={
                purpose === "GCASH_QR"
                  ? "image/png,image/jpeg"
                  : "application/pdf,image/png,image/jpeg"
              }
              disabled={busy}
              onChange={(e) => upload(e, purpose)}
            />
          </label>
        )}
      </div>
    );
  }
  return (
    <div className="partner-form">
      <div className="page-title">
        <div>
          <h1>Agency partner application</h1>
          <p>Set the terms for your agency’s place on Rent2Go.</p>
        </div>
        <span
          className={`status ${app.status === "APPROVED" ? "approved" : ""}`}
        >
          {statusLabel(app.status)}
        </span>
      </div>
      <div className="application-meta">
        <span>Last saved {date(app.updatedAt)}</span>
        <span>
          {dirty ? "Unsaved changes" : `Saved · version ${app.version}`}
        </span>
      </div>
      {app.approvedAgency && (
        <section className="notice">
          <h2>
            Approved agency policy: revision{" "}
            {app.approvedAgency.approved_revision}
          </h2>
          <p>
            {app.approvedAgency.active
              ? "Your agency’s existing approved policy remains effective. Draft or pending revisions do not replace it."
              : "Agency operations are currently suspended."}
          </p>
          {app.approvedAgency.active &&
            ["APPROVED", "REJECTED", "WITHDRAWN"].includes(app.status) && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => act("AMEND")}
              >
                Revise agency policies
              </button>
            )}
        </section>
      )}
      {!app.approvedAgency &&
        ["REJECTED", "WITHDRAWN"].includes(app.status) && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => act("AMEND")}
          >
            Revise and reapply
          </button>
        )}
      {app.reviews.length > 0 && (
        <section className="review-feedback">
          <h2>Review feedback</h2>
          <p>{app.reviews[0].reason}</p>
          <small>
            Submitted revision {app.reviews[0].revision} ·{" "}
            {date(app.reviews[0].created_at)}
          </small>
        </section>
      )}
      <div aria-live="polite">
        {notice && (
          <p className="success-box">
            <Check size={18} />
            {notice}
          </p>
        )}
      </div>
      {error && (
        <div className="error-box" role="alert">
          <strong>{error}</strong>
          {issues.length > 0 && (
            <ul>
              {issues.map((i, n) => (
                <li key={n}>
                  {fieldLabels[i.path[0] as keyof ApplicationInput] ||
                    String(i.path[0] || "Application")}
                  : {i.message}
                </li>
              ))}
            </ul>
          )}
          <button
            className="link-button"
            onClick={() => {
              if (
                !dirty ||
                window.confirm("Reload and discard unsaved changes?")
              )
                refresh().catch(() =>
                  setError("Unable to reload. Check your connection."),
                );
            }}
          >
            Reload saved application
          </button>
        </div>
      )}
      {!editable ? (
        <>
          <section className="notice">
            <h2>
              {app.status === "APPROVED"
                ? "Your agency is approved"
                : app.status === "WITHDRAWN"
                  ? "Application withdrawn"
                  : app.status === "REJECTED"
                    ? "Application was not approved"
                    : "Your application is with the review team"}
            </h2>
            <p>
              {app.status === "APPROVED"
                ? "Your approved policies govern new requests. Open your agency workspace to manage services and bookings."
                : "Your submitted details and review history are preserved below."}
            </p>
          </section>
          <ApplicationSummary payload={data} />
        </>
      ) : (
        <>
          <nav className="form-steps" aria-label="Application sections">
            {steps.map((s, i) => (
              <button
                key={s}
                className={step === i ? "current" : ""}
                aria-current={step === i ? "step" : undefined}
                disabled={busy}
                onClick={() => (dirty ? act("SAVE", i) : setStep(i))}
              >
                <span>{i + 1}</span>
                {s}
              </button>
            ))}
          </nav>
          <section className="form-panel" aria-labelledby="section-title">
            <div className="section-heading">
              <h2 id="section-title">{steps[step]}</h2>
              <p>
                {
                  [
                    "Tell us who operates your agency and upload your business evidence.",
                    "Choose the services your agency plans to offer.",
                    "Write the policies renters will review before agreeing to a booking.",
                    "Declare your starting rates. Final booking prices will be itemized in quotations.",
                    "Keep renter collections, platform payments, and revenue sharing clear.",
                    "Review every section and confirm your details before submitting.",
                  ][step]
                }
              </p>
            </div>
            <fieldset disabled={busy} className="editing-fields">
              {step === 0 && (
                <>
                  <div className="field-grid">
                    {businessFields.map((k) =>
                      field(k, k === "address" || k === "serviceAreas"),
                    )}
                  </div>
                  {documents("REGISTRATION", "Business registration evidence")}
                  {documents("PERMIT", "Operating permit (if applicable)")}
                </>
              )}
              {step === 1 && (
                <fieldset>
                  <legend>Services offered</legend>
                  <div className="choice-list">
                    {serviceOptions.map((s) => (
                      <label key={s}>
                        <input
                          type="checkbox"
                          checked={data.services.includes(s)}
                          onChange={(e) =>
                            update(
                              "services",
                              e.target.checked
                                ? [...data.services, s]
                                : data.services.filter((v) => v !== s),
                            )
                          }
                        />
                        <span>
                          {serviceLabels[s]}
                          <small>
                            {s === "GROUP_TOUR"
                              ? "Scheduled departures, priced per person"
                              : s === "PRIVATE_TOUR"
                                ? "Private slots, priced for the whole party"
                                : "Rental rates, availability and vehicle inspections"}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              {step === 2 && (
                <div className="field-grid">
                  {termFields.map((k) => field(k, true))}
                  <p className="muted full">
                    Enter your actual operating policies. Rent2Go does not
                    generate or guarantee legal terms for your agency.
                  </p>
                </div>
              )}
              {step === 3 && (
                <div className="field-grid">
                  <label className="field">
                    Rental billing unit
                    <select
                      value={data.billingUnit}
                      onChange={(e) =>
                        update(
                          "billingUnit",
                          e.target.value as ApplicationInput["billingUnit"],
                        )
                      }
                    >
                      <option value="24_HOUR">Per 24 hours</option>
                      <option value="CALENDAR_DAY">Per calendar day</option>
                      <option value="HOUR">Per hour</option>
                    </select>
                  </label>
                  {(
                    [
                      "dailyRateCentavos",
                      "depositCentavos",
                      "driverFeeCentavos",
                      "perPersonCentavos",
                      "perPartyCentavos",
                      "holdHours",
                      "bufferMinutes",
                    ] as const
                  ).map(numberField)}
                  <label className="field">
                    Driver fee unit
                    <select
                      value={data.driverFeeUnit ?? ""}
                      onChange={(e) =>
                        update(
                          "driverFeeUnit",
                          (e.target.value ||
                            null) as ApplicationInput["driverFeeUnit"],
                        )
                      }
                    >
                      <option value="">
                        Choose a unit for with-driver service
                      </option>
                      {Object.entries(driverFeeUnitLabels).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  {field("inclusions", true)}
                  {field("exclusions", true)}
                  <p className="muted full">
                    Set rates for selected services. Enter zero explicitly for
                    an included charge or no deposit. Blank means the policy has
                    not been set.
                  </p>
                </div>
              )}
              {step === 4 && (
                <>
                  <fieldset>
                    <legend>Payment methods accepted from renters</legend>
                    <div className="choice-list">
                      {paymentOptions.map((m) => (
                        <label key={m}>
                          <input
                            type="checkbox"
                            checked={data.acceptedMethods.includes(m)}
                            onChange={(e) =>
                              update(
                                "acceptedMethods",
                                e.target.checked
                                  ? [...data.acceptedMethods, m]
                                  : data.acceptedMethods.filter((v) => v !== m),
                              )
                            }
                          />
                          {methodLabels[m]}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <p className="demo-note">
                    Demo gateway options simulate status only. Never enter real
                    card or wallet credentials.
                  </p>
                  {data.acceptedMethods.includes("GCASH") && (
                    <>
                      <div className="field-grid">
                        {field("gcashAccountName")}
                        {field("gcashInstructions", true)}
                      </div>
                      {documents("GCASH_QR", "Business-owned GCash QR")}
                    </>
                  )}
                  <hr />
                  <h3>How your agency pays Rent2Go</h3>
                  <p>
                    Rent2Go’s default commission is 10%. Set a settlement
                    preference for demonstration; no payment is taken on
                    application.
                  </p>
                  <div className="field-grid">
                    <label className="field">
                      Platform settlement method
                      <select
                        value={data.platformPaymentMethod}
                        onChange={(e) =>
                          update(
                            "platformPaymentMethod",
                            e.target
                              .value as ApplicationInput["platformPaymentMethod"],
                          )
                        }
                      >
                        {paymentOptions
                          .filter((m) => m.startsWith("DEMO"))
                          .map((m) => (
                            <option key={m} value={m}>
                              {methodLabels[m]}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="field">
                      Settlement schedule
                      <select
                        value={data.settlementSchedule}
                        onChange={(e) =>
                          update(
                            "settlementSchedule",
                            e.target
                              .value as ApplicationInput["settlementSchedule"],
                          )
                        }
                      >
                        <option value="PER_BOOKING">
                          Per completed booking
                        </option>
                        <option value="WEEKLY">Weekly</option>
                        <option value="MONTHLY">Monthly</option>
                      </select>
                    </label>
                  </div>
                  <hr />
                  <h3>Default consigned-vehicle revenue sharing</h3>
                  <p>
                    Adjust the starting agreement to suit your agency and
                    Cosigner. Total must equal 100%.
                  </p>
                  <div className="split-inputs">
                    {(
                      Object.keys(
                        data.split,
                      ) as (keyof ApplicationInput["split"])[]
                    ).map((k) => (
                      <label key={k} htmlFor={`share-${k}`}>
                        {k === "platform" ? "Rent2Go" : k}
                        <div>
                          <input
                            id={`share-${k}`}
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            value={data.split[k] / 100}
                            onChange={(e) =>
                              update("split", {
                                ...data.split,
                                [k]: Math.round(Number(e.target.value) * 100),
                              })
                            }
                          />
                          <span>%</span>
                        </div>
                      </label>
                    ))}
                  </div>
                  <p
                    className={
                      Object.values(data.split).reduce((a, b) => a + b, 0) ===
                      10000
                        ? "total valid"
                        : "total invalid"
                    }
                  >
                    Total:{" "}
                    {Object.values(data.split).reduce((a, b) => a + b, 0) / 100}
                    %
                  </p>
                  <p className="muted">
                    Proposed basis: eligible rental service revenue. Refundable
                    deposits remain separate. Specific vehicle agreements may
                    override these defaults; approved booking versions remain
                    unchanged.
                  </p>
                  <ExtraChargePolicyEditor key={`extra-${app.version}`} value={data.extraChargePolicies} services={data.services} onChange={value=>update("extraChargePolicies",value)}/>
                </>
              )}
              {step === 5 && (
                <>
                  <ApplicationSummary payload={data} />
                  <label className="consent">
                    <input
                      type="checkbox"
                      checked={data.consent}
                      onChange={(e) => update("consent", e.target.checked)}
                    />
                    <span>
                      I am authorized to represent this agency. I confirm the
                      supplied details and policies are accurate, and consent to
                      their review for this partnership application.
                    </span>
                  </label>
                  <p className="muted">
                    Business registration evidence is required. Selecting manual
                    GCash also requires a business-owned QR image.
                  </p>
                </>
              )}
            </fieldset>
          </section>
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => act("SAVE")}
            >
              <Save size={17} />
              {busy ? "Saving…" : "Save draft"}
            </button>
            <div>
              {step > 0 && (
                <button
                  className="button quiet"
                  disabled={busy}
                  onClick={() => setStep(step - 1)}
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
              )}
              {step < 5 ? (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => act("SAVE", step + 1)}
                >
                  Save & continue
                  <ArrowRight size={17} />
                </button>
              ) : (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => act("SUBMIT")}
                >
                  {busy ? "Submitting…" : "Submit for review"}
                  <ArrowRight size={17} />
                </button>
              )}
            </div>
          </div>
        </>
      )}
      {["DRAFT", "SUBMITTED", "CHANGES_REQUESTED"].includes(app.status) && (
        <button
          className="link-button withdraw"
          disabled={busy}
          onClick={() => act("WITHDRAW")}
        >
          Withdraw application
        </button>
      )}
      {app.revisions.length > 0 && (
        <section className="history">
          <h2>Submitted versions</h2>
          {app.revisions.map((r) => (
            <details key={r.revision}>
              <summary>
                Revision {r.revision} · {date(r.submitted_at)}
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
              {app.reviews
                .filter((v) => v.revision === r.revision)
                .map((v, n) => (
                  <p key={n} className="review-feedback">
                    {statusLabel(v.decision)}: {v.reason}
                  </p>
                ))}
            </details>
          ))}
        </section>
      )}
    </div>
  );
}
