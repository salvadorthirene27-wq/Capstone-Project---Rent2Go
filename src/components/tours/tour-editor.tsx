"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { tourDetail } from "@/modules/tours/service";
import { tourSchema, type TourInput } from "@/modules/tours/schema";
import { manilaInputToIso } from "@/lib/manila-time";
import { date, money } from "@/modules/partners/presentation";
type Detail = Awaited<ReturnType<typeof tourDetail>>;
const textFields = [
  ["description", "Description"],
  ["inclusions", "Included in the price"],
  ["exclusions", "Excluded / additional charges"],
  ["eligibilityTerms", "Guest eligibility and requirements"],
  ["terms", "Package terms"],
  ["cancellationPolicy", "Cancellation policy"],
  ["refundPolicy", "Refund policy"],
] as const;
export function TourEditor({
  initial,
  agencyId,
  defaults,
  modes,
}: {
  initial: Detail | null;
  agencyId: string;
  defaults: TourInput;
  modes: TourInput["mode"][];
}) {
  const router = useRouter(),
    [payload, setPayload] = useState(initial?.payload ?? defaults),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [refreshing, setRefreshing] = useState(false),
    [error, setError] = useState("");
  const published = initial?.state === "PUBLISHED";
  function change<K extends keyof TourInput>(key: K, value: TourInput[K]) {
    setPayload((p) => ({ ...p, [key]: value }));
    setDirty(true);
  }
  useEffect(() => {
    function before(e: BeforeUnloadEvent) {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    function leave(e: MouseEvent) {
      if (
        dirty &&
        e.target instanceof Element &&
        e.target.closest("a[href]") &&
        !window.confirm("You have unsaved package changes. Leave this page?")
      )
        e.preventDefault();
    }
    window.addEventListener("beforeunload", before);
    document.addEventListener("click", leave, true);
    return () => {
      window.removeEventListener("beforeunload", before);
      document.removeEventListener("click", leave, true);
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
        }),
        data = await r.json();
      if (!r.ok)
        throw Error(
          data.issues
            ? data.issues
                .map(
                  (i: { path: string[]; message: string }) =>
                    `${i.path.join(".")}: ${i.message}`,
                )
                .join("; ")
            : data.error,
        );
      // The page remounts this editor when the persisted record changes.
      // Keep fields locked until that refreshed version arrives.
      setRefreshing(true);
      return data;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to save. Please try again.",
      );
      setBusy(false);
      return null;
    }
  }
  async function command(action: string, extra: Record<string, unknown> = {}) {
    if (!initial) return;
    const saved = await request(`/api/agency-tours/${initial.id}`, {
      action,
      version: initial.version,
      ...extra,
    });
    if (saved) {
      setDirty(false);
      router.refresh();
    }
  }
  return (
    <div className="resource-editor tour-editor">
      <h1>{initial ? "Manage tour package" : "Create a tour package"}</h1>
      <p>
        {initial
          ? `${initial.state.toLowerCase()} · Saved version ${initial.version} · Publication ${initial.revision}`
          : "Define the experience, pricing and party rules, then add photos and publish available dates."}
      </p>
      <p>
        Tour-only fulfillment. Included operator transport does not create a
        customer vehicle rental.
      </p>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
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
      <fieldset disabled={busy}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const valid = tourSchema.parse(payload),
                saved = initial
                  ? await request(`/api/agency-tours/${initial.id}`, {
                      action: "SAVE",
                      version: initial.version,
                      payload: valid,
                    })
                  : await request("/api/agency-tours", {
                      agencyId,
                      payload: valid,
                    });
              if (saved) {
                setDirty(false);
                if (initial) router.refresh();
                else router.push(`/agency/${agencyId}/tours/${saved.id}`);
              }
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Check package fields.",
              );
            }
          }}
        >
          <fieldset disabled={published}>
            <section className="context-section">
              <h2>The experience</h2>
              <label>
                Package title
                <input
                  required
                  minLength={3}
                  maxLength={160}
                  value={payload.title}
                  onChange={(e) => change("title", e.target.value)}
                />
              </label>
              <div className="field-grid">
                <label>
                  Tour model
                  <select
                    value={payload.mode}
                    disabled={Boolean(initial?.revision)}
                    onChange={(e) =>
                      change("mode", e.target.value as TourInput["mode"])
                    }
                  >
                    {modes.map((m) => (
                      <option key={m} value={m}>
                        {m === "GROUP"
                          ? "Scheduled group · per person"
                          : "Private · per party"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Service area
                  <input
                    required
                    minLength={2}
                    maxLength={300}
                    value={payload.serviceArea}
                    onChange={(e) => change("serviceArea", e.target.value)}
                  />
                </label>
              </div>
              <label>
                Meeting point
                <textarea
                  required
                  minLength={5}
                  maxLength={2000}
                  value={payload.meetingPoint}
                  onChange={(e) => change("meetingPoint", e.target.value)}
                />
              </label>
              <label>
                Price in PHP (
                {payload.mode === "GROUP"
                  ? "per person"
                  : "for the whole party"}
                )
                <input
                  type="number"
                  required
                  min="0.01"
                  max="1000000"
                  step="0.01"
                  value={
                    Number.isFinite(payload.priceCentavos)
                      ? payload.priceCentavos / 100
                      : ""
                  }
                  onChange={(e) =>
                    change(
                      "priceCentavos",
                      Math.round(Number(e.target.value) * 100),
                    )
                  }
                />
              </label>
              <div className="field-grid">
                {(["minParty", "maxParty"] as const).map((k) => (
                  <label key={k}>
                    {k === "minParty" ? "Minimum" : "Maximum"} guests per
                    booking
                    <input
                      type="number"
                      required
                      min={1}
                      max={500}
                      value={payload[k]}
                      onChange={(e) => change(k, Number(e.target.value))}
                    />
                  </label>
                ))}
              </div>
              <label className="consent-row">
                <input
                  type="checkbox"
                  checked={payload.transportIncluded}
                  onChange={(e) =>
                    change("transportIncluded", e.target.checked)
                  }
                />
                Operator transport is included in this itinerary
              </label>
              {textFields.map(([key, label]) => (
                <label key={key}>
                  {label}
                  <textarea
                    required
                    minLength={
                      key === "inclusions" || key === "exclusions" ? 1 : 10
                    }
                    maxLength={
                      key === "inclusions" || key === "exclusions" ? 4000 : 8000
                    }
                    value={payload[key]}
                    onChange={(e) => change(key, e.target.value)}
                  />
                </label>
              ))}
            </section>
            <section className="context-section">
              <h2>Itinerary</h2>
              <p>
                Describe the stops in the order guests will experience them.
              </p>
              {payload.itinerary.map((stop, i) => (
                <div className="itinerary-stop" key={i}>
                  <h3>Stop {i + 1}</h3>
                  <label>
                    Stop {i + 1} title
                    <input
                      required
                      minLength={2}
                      maxLength={160}
                      value={stop.title}
                      onChange={(e) =>
                        change(
                          "itinerary",
                          payload.itinerary.map((s, j) =>
                            j === i ? { ...s, title: e.target.value } : s,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Stop {i + 1} description
                    <textarea
                      required
                      minLength={10}
                      maxLength={8000}
                      value={stop.description}
                      onChange={(e) =>
                        change(
                          "itinerary",
                          payload.itinerary.map((s, j) =>
                            j === i ? { ...s, description: e.target.value } : s,
                          ),
                        )
                      }
                    />
                  </label>
                  <div className="form-actions">
                    <button
                      type="button"
                      className="button secondary"
                      disabled={i === 0}
                      onClick={() => {
                        const stops = [...payload.itinerary];
                        [stops[i - 1], stops[i]] = [stops[i], stops[i - 1]];
                        change("itinerary", stops);
                      }}
                    >
                      Move stop {i + 1} up
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={payload.itinerary.length === 1}
                      onClick={() =>
                        change(
                          "itinerary",
                          payload.itinerary.filter((_, j) => i !== j),
                        )
                      }
                    >
                      Remove stop {i + 1}
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="button secondary"
                disabled={payload.itinerary.length >= 30}
                onClick={() =>
                  change("itinerary", [
                    ...payload.itinerary,
                    { title: "", description: "" },
                  ])
                }
              >
                Add itinerary stop
              </button>
            </section>
            <button className="button">
              {initial ? "Save package" : "Create package draft"}
            </button>
          </fieldset>
        </form>
        {dirty && (
          <p role="status">
            Unsaved package changes. Save before uploading, publishing or
            updating dates.
          </p>
        )}
        {initial && (
          <fieldset disabled={dirty}>
            <section className="context-section">
              <h2>Package photos</h2>
              <p>
                Publish only photos you have permission to use. Draft images
                remain private.
              </p>
              <ul className="vehicle-files">
                {initial.files
                  .filter((f) => f.is_current)
                  .map((f) => (
                    <li key={f.id}>
                      <a
                        href={`/api/tour-photos/${f.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {f.original_name}
                      </a>
                      <button
                        className="button secondary"
                        disabled={published}
                        onClick={() =>
                          command("REMOVE_PHOTO", { fileId: f.id })
                        }
                      >
                        Remove photo
                      </button>
                    </li>
                  ))}
              </ul>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  data.set("version", String(initial.version));
                  if (
                    await request(
                      `/api/agency-tours/${initial.id}/photos`,
                      data,
                    )
                  )
                    router.refresh();
                }}
              >
                <label>
                  Choose package photo
                  <input
                    type="file"
                    name="file"
                    accept="image/png,image/jpeg"
                    required
                    disabled={published}
                  />
                </label>
                <button className="button secondary" disabled={published}>
                  Upload photo
                </button>
              </form>
            </section>
            <section className="context-section">
              <h2>Publication</h2>
              {published ? (
                <>
                  <p>
                    Withdraw from new requests before editing. Existing bookings
                    and schedules retain their saved versions.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      command("WITHDRAW", {
                        reason: new FormData(e.currentTarget).get("reason"),
                      });
                    }}
                  >
                    <label>
                      Withdrawal reason
                      <textarea
                        name="reason"
                        required
                        minLength={10}
                        maxLength={2000}
                      />
                    </label>
                    <button className="button secondary">
                      Withdraw package
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <p>
                    Publication saves the exact package, agency policy and photo
                    revision. Add available dates after publishing.
                  </p>
                  <button className="button" onClick={() => command("PUBLISH")}>
                    Publish package
                  </button>
                </>
              )}
            </section>
            {published && (
              <section className="context-section">
                <h2>
                  {payload.mode === "GROUP"
                    ? "Add a group departure"
                    : "Add an exclusive private slot"}
                </h2>
                <p>
                  Times use Manila (UTC+08:00).{" "}
                  {payload.mode === "GROUP"
                    ? "Capacity is the total number of seats on this departure."
                    : "One party may reserve a private slot; capacity is its guest limit."}
                </p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      const d = new FormData(e.currentTarget),
                        body = {
                          version: initial.version,
                          payload: {
                            startAt: manilaInputToIso(String(d.get("startAt"))),
                            endAt: manilaInputToIso(String(d.get("endAt"))),
                            cutoffAt: manilaInputToIso(
                              String(d.get("cutoffAt")),
                            ),
                            capacity: Number(d.get("capacity")),
                          },
                        };
                      if (
                        await request(
                          `/api/agency-tours/${initial.id}/schedules`,
                          body,
                        )
                      )
                        router.refresh();
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Check schedule dates.",
                      );
                    }
                  }}
                >
                  <div className="field-grid">
                    {[
                      ["startAt", "Departure / slot start"],
                      ["endAt", "Service end"],
                      ["cutoffAt", "Booking cutoff"],
                    ].map(([name, label]) => (
                      <label key={name}>
                        {label} (Manila)
                        <input type="datetime-local" name={name} required />
                      </label>
                    ))}
                    <label>
                      {payload.mode === "GROUP"
                        ? "Seat capacity"
                        : "Maximum guests in the private party"}
                      <input
                        type="number"
                        name="capacity"
                        required
                        min={
                          payload.mode === "GROUP"
                            ? payload.maxParty
                            : payload.minParty
                        }
                        max={payload.mode === "GROUP" ? 5000 : payload.maxParty}
                        defaultValue={
                          payload.mode === "GROUP"
                            ? Math.max(20, payload.maxParty)
                            : payload.maxParty
                        }
                      />
                    </label>
                  </div>
                  <button className="button">Save available date</button>
                </form>
              </section>
            )}
            <section className="context-section">
              <h2>Dates and service history</h2>
              {!initial.schedules.length && (
                <p>No departure dates or private slots saved yet.</p>
              )}
              <ol className="resource-history">
                {initial.schedules.map((s) => (
                  <li key={s.id}>
                    <h3>
                      {date(s.start_at)} to {date(s.end_at)}
                    </h3>
                    <p>
                      {s.status.toLowerCase()} · Publication {s.revision} ·{" "}
                      {s.mode === "PRIVATE"
                        ? `${s.capacity} guests, one exclusive party`
                        : `${s.capacity} seats`}{" "}
                      · {s.reserved_units} allocated{" "}
                      {s.mode === "PRIVATE" ? "parties" : "seats"}
                    </p>
                    <p>Booking cutoff: {date(s.cutoff_at)}</p>
                    {s.status === "CANCELLED" ? (
                      <p>Cancelled: {s.cancellation_reason}</p>
                    ) : (
                      <details className="policy-disclosure">
                        <summary>Cancel this available date</summary>
                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            if (
                              await request(`/api/tour-schedules/${s.id}`, {
                                action: "CANCEL",
                                reason: new FormData(e.currentTarget).get(
                                  "reason",
                                ),
                              })
                            )
                              router.refresh();
                          }}
                        >
                          <label>
                            Cancellation reason
                            <textarea
                              name="reason"
                              required
                              minLength={10}
                              maxLength={2000}
                            />
                          </label>
                          <p>
                            Allocated bookings must be resolved through
                            cancellation and refund review first.
                          </p>
                          <button className="button secondary">
                            Cancel available date
                          </button>
                        </form>
                      </details>
                    )}
                  </li>
                ))}
              </ol>
            </section>
            <section className="context-section">
              <h2>Publication history</h2>
              {initial.revisions.map((r) => (
                <details key={r.revision} className="policy-disclosure">
                  <summary>
                    Publication {r.revision} · {date(r.created_at)}
                  </summary>
                  <p>
                    {r.payload.title} · {money(r.payload.priceCentavos)}{" "}
                    {r.payload.mode === "GROUP" ? "per person" : "per party"}
                  </p>
                  <p>
                    Agency policy {r.agency_policy_revision} · Agency{" "}
                    {r.agency_bps / 100}% · Rent2Go {r.platform_bps / 100}% of
                    eligible service revenue. No Cosigner or maintenance
                    allocation applies to tour-only services.
                  </p>
                  <p className="preserve-lines">{r.payload.terms}</p>
                </details>
              ))}
            </section>
          </fieldset>
        )}
      </fieldset>
      {busy && <p role="status">Saving package…</p>}
    </div>
  );
}
