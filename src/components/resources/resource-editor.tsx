"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { resourceDetail } from "@/modules/resources/service";
import { manilaInputToIso } from "@/lib/manila-time";
import { date, money } from "@/modules/partners/presentation";
type Detail = Awaited<ReturnType<typeof resourceDetail>>;
function WindowFields() {
  return (
    <div className="field-grid">
      <label>
        Start (Manila, UTC+08:00)
        <input name="startAt" type="datetime-local" required />
      </label>
      <label>
        End (Manila, UTC+08:00)
        <input name="endAt" type="datetime-local" required />
      </label>
    </div>
  );
}
export function ResourceEditor({ initial }: { initial: Detail }) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [refreshing, setRefreshing] = useState(false),
    [driverDirty, setDriverDirty] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<{
      free: boolean;
      bookable: boolean;
      startAt: string;
      endAt: string;
    } | null>(null);
  useEffect(() => {
    function warn(e: BeforeUnloadEvent) {
      if (driverDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    function leaving(e: MouseEvent) {
      if (
        driverDirty &&
        e.target instanceof Element &&
        e.target.closest("a[href]") &&
        !window.confirm("You have unsaved driver changes. Leave this page?")
      )
        e.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", leaving, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", leaving, true);
    };
  }, [driverDirty]);
  async function send(url: string, payload: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
            : data.error || "Unable to finish this update.",
        );
      setRefreshing(true);
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to finish. Try again.");
      setBusy(false);
      return false;
    }
  }
  function windowFrom(form: HTMLFormElement) {
    const data = new FormData(form);
    return {
      startAt: manilaInputToIso(String(data.get("startAt"))),
      endAt: manilaInputToIso(String(data.get("endAt"))),
    };
  }
  return (
    <div className="resource-editor">
      <h1>{initial.label}</h1>
      <p>
        {initial.kind === "DRIVER"
          ? "Driver calendar"
          : "Vehicle availability and maintenance"}{" "}
        · All displayed times are Asia/Manila (UTC+08:00).
      </p>
      {error && (
        <div className="notice" role="alert">
          <p>{error}</p>
          <button
            className="button secondary"
            onClick={() => {
              if (
                !driverDirty ||
                window.confirm("Discard unsaved driver changes and reload?")
              )
                window.location.reload();
            }}
          >
            Reload current records
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
      <fieldset disabled={busy}>
        {initial.driver && (
          <section className="context-section">
            <h2>Driver details</h2>
            <form
              onChange={() => setDriverDirty(true)}
              onSubmit={async (e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                const saved = await send(`/api/resources/${initial.id}`, {
                  action: "SAVE_DRIVER",
                  version: initial.driver!.version,
                  payload: {
                    name: d.get("name"),
                    phone: d.get("phone"),
                    licenseNumber: d.get("licenseNumber"),
                    licenseExpiry: d.get("licenseExpiry"),
                    active: d.get("active") === "on",
                  },
                });
                if (saved) setDriverDirty(false);
              }}
            >
              <div className="field-grid">
                <label>
                  Driver name
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={120}
                    defaultValue={initial.driver.name}
                  />
                </label>
                <label>
                  Contact number
                  <input
                    name="phone"
                    required
                    minLength={7}
                    maxLength={32}
                    defaultValue={initial.driver.phone}
                  />
                </label>
                <label>
                  License identifier
                  <input
                    name="licenseNumber"
                    required
                    minLength={3}
                    maxLength={80}
                    defaultValue={initial.driver.licenseNumber}
                  />
                </label>
                <label>
                  License expiry
                  <input
                    name="licenseExpiry"
                    type="date"
                    required
                    defaultValue={initial.driver.licenseExpiry}
                  />
                </label>
              </div>
              <label className="consent-row">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={initial.driver.active}
                />
                Active for assignments
              </label>
              <p>
                Resolve assigned services before deactivation or shortening
                license validity. Booking history preserves the driver’s
                identity.
              </p>
              <button className="button secondary">Save driver details</button>
              {driverDirty && (
                <p role="status">
                  Unsaved driver changes. Save before updating the calendar.
                </p>
              )}
            </form>
          </section>
        )}
        <fieldset disabled={driverDirty}>
          <section className="context-section">
            <h2>Check an interval</h2>
            <form
              aria-label="Check resource interval"
              onChange={() => setResult(null)}
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  const q = windowFrom(e.currentTarget),
                    r = await fetch(
                      `/api/resources/${initial.id}/availability?${new URLSearchParams(q)}`,
                    ),
                    data = await r.json();
                  if (!r.ok) throw Error(data.error);
                  setResult(data);
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Unable to check availability.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <WindowFields />
              <button className="button secondary">Check availability</button>
            </form>
            {result && (
              <div className="notice" role="status">
                <p>
                  {date(result.startAt)} to {date(result.endAt)}
                </p>
                <strong>
                  {result.free
                    ? "No overlapping blocks found"
                    : "This interval is occupied"}
                </strong>
                {result.free && !result.bookable && (
                  <p>
                    Listing approval, active status or driver license validity
                    still prevents assignment.
                  </p>
                )}
                <p>
                  Availability is checked again when a service is allocated.
                </p>
              </div>
            )}
          </section>
          <section className="context-section">
            <h2>
              Schedule unavailability
              {initial.kind === "VEHICLE" ? " or maintenance" : ""}
            </h2>
            <form
              aria-label="Schedule resource block"
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  const d = new FormData(e.currentTarget),
                    q = windowFrom(e.currentTarget);
                  send(`/api/resources/${initial.id}/blocks`, {
                    ...q,
                    kind: d.get("kind"),
                    note: d.get("note"),
                  });
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Check the dates.");
                }
              }}
            >
              <WindowFields />
              <label>
                Block type
                <select name="kind">
                  <option value="UNAVAILABLE">Unavailable</option>
                  {initial.kind === "VEHICLE" && (
                    <option value="MAINTENANCE">Vehicle maintenance</option>
                  )}
                </select>
              </label>
              <label>
                Reason / service description
                <textarea
                  name="note"
                  required
                  minLength={10}
                  maxLength={2000}
                />
              </label>
              <p>
                Overlapping active reservations or blocks must be resolved
                first. Adjacent end/start times are allowed.
              </p>
              <button className="button">Save block</button>
            </form>
          </section>
          <section className="context-section">
            <h2>Calendar and service history</h2>
            <p>
              {initial.total} records · Page {initial.page} of{" "}
              {initial.pageCount}
            </p>
            {!initial.occupations.length && (
              <p>No scheduled blocks or recorded maintenance yet.</p>
            )}
            <ol className="resource-history">
              {initial.occupations.map((o) => (
                <li key={o.id}>
                  <div className="page-title">
                    <h3>
                      {o.kind === "BOOKING"
                        ? "Reserved service"
                        : o.kind === "MAINTENANCE"
                          ? "Maintenance"
                          : "Unavailable"}
                    </h3>
                    <span className="status">
                      {o.completed_at
                        ? "Completed"
                        : o.cancelled_at
                          ? "Cancelled"
                          : "Scheduled"}
                    </span>
                  </div>
                  <p>
                    {date(o.start_at)} to {date(o.end_at)}
                  </p>
                  <p className="preserve-lines">{o.note}</p>
                  {o.completed_at && (
                    <p>
                      Completed {date(o.completed_at)} · Recorded service cost{" "}
                      {money(o.cost_centavos)}
                      <br />
                      {o.completion_note}
                    </p>
                  )}
                  {o.cancelled_at && !o.completed_at && (
                    <p>
                      Released {date(o.cancelled_at)} · {o.cancellation_reason}
                    </p>
                  )}
                  {o.canManage && (
                    <details className="policy-disclosure">
                      <summary>Manage this block</summary>
                      {o.kind === "MAINTENANCE" && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const d = new FormData(e.currentTarget);
                            send(`/api/resource-claims/${o.id}`, {
                              action: "COMPLETE",
                              version: o.maintenance_version,
                              costCentavos: Math.round(
                                Number(d.get("cost")) * 100,
                              ),
                              note: d.get("completionNote"),
                            });
                          }}
                        >
                          <h4>
                            Complete service and release the remaining block
                          </h4>
                          <label>
                            Actual service cost (PHP)
                            <input
                              name="cost"
                              type="number"
                              min={0}
                              max={1000000}
                              step="0.01"
                              required
                            />
                          </label>
                          <label>
                            Completion notes
                            <textarea
                              name="completionNote"
                              minLength={10}
                              maxLength={2000}
                              required
                            />
                          </label>
                          <p>
                            This records service cost for maintenance
                            reconciliation.
                          </p>
                          <button className="button secondary">
                            Record completion
                          </button>
                        </form>
                      )}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const d = new FormData(e.currentTarget);
                          send(`/api/resource-claims/${o.id}`, {
                            action: "CANCEL",
                            reason: d.get("reason"),
                          });
                        }}
                      >
                        <label>
                          Cancellation reason
                          <textarea
                            name="reason"
                            minLength={10}
                            maxLength={2000}
                            required
                          />
                        </label>
                        <button className="button secondary">
                          Cancel this block
                        </button>
                      </form>
                    </details>
                  )}
                  {o.kind === "BOOKING" && !o.cancelled_at && (
                    <p>Change this interval through its booking workflow.</p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </fieldset>
      </fieldset>
      {busy && <p role="status">Updating calendar…</p>}
    </div>
  );
}
