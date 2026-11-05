"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { date, money } from "@/modules/partners/presentation";

type Outcome = "PENDING" | "ACCEPTED" | "DECLINED" | "WITHDRAWN" | "EXPIRED";
type Quote = {
  id: string; revision: number; digest: string; issuedAt: string; expiresAt: string;
  lines: { lineId: string; title: string; kind: string; startAt: string; endAt: string; partySize: number; serviceCentavos: number; refundableDepositCentavos: number; driverName: string | null }[];
  totals: { serviceCentavos: number; refundableDepositCentavos: number; totalCentavos: number };
  policies: { lineId: string; terms: string; cancellationPolicy: string; refundPolicy: string; damagePolicy: string; latePolicy: string }[];
  outcome: Outcome;
};
type Quotation = {
  serverNow?: string;
  requestId: string; requestVersion: number; status: string; isOwner: boolean; isOperator: boolean; canIssue: boolean; canRespond: boolean;
  driverSelections: { lineId: string; title: string; drivers: { id: string; name: string }[] }[];
  quote: Quote | null;
  history: { id: string; revision: number; issuedAt: string; expiresAt: string; outcome: Outcome }[];
};
const outcomeLabels: Record<Outcome, string> = { PENDING: "Awaiting response", ACCEPTED: "Accepted", DECLINED: "Declined", WITHDRAWN: "Withdrawn", EXPIRED: "Expired" };
const policyLabels = { terms: "Service terms", cancellationPolicy: "Cancellation", refundPolicy: "Refunds", damagePolicy: "Damage and deposit", latePolicy: "Late returns and no-shows" } as const;

export function BookingQuotation({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [data, setData] = useState<Quotation | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [stale, setStale] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [drivers, setDrivers] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [expired, setExpired] = useState(false);
  const clock = useRef({ epoch: Date.now(), receivedAt: performance.now() });
  const quotationNow = () => clock.current.epoch + performance.now() - clock.current.receivedAt;
  const endpoint = `/api/booking-requests/${encodeURIComponent(requestId)}/quotation`;

  function receive(result: Quotation) {
    const serverNow = Date.parse(result.serverNow ?? "");
    clock.current = { epoch: Number.isFinite(serverNow) ? serverNow : Date.now(), receivedAt: performance.now() };
    setData(result); setReviewed(false); setDrivers({}); setReason(""); setStale(false);
    setExpired(Boolean(result.quote && Date.parse(result.quote.expiresAt) <= quotationNow()));
  }
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setBusy(true); setError(""); setMessage(""); setStale(false); setReviewed(false); setDrivers({}); setReason("");
    fetch(endpoint, { cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Unable to load quotation. Try reloading.");
      if (!controller.signal.aborted) receive(result);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load quotation. Try reloading.");
    }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [endpoint]);

  useEffect(() => {
    if (!data?.quote) return;
    const expiresAt = Date.parse(data.quote.expiresAt);
    let timer: ReturnType<typeof setTimeout>;
    function checkExpiry() {
      const remaining = expiresAt - quotationNow();
      if (remaining <= 0) { setExpired(true); return; }
      // Browser timers cap at a signed 32-bit integer; check again for longer holds.
      timer = setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647));
    }
    checkExpiry();
    return () => clearTimeout(timer);
  }, [data]);

  async function reload() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Unable to load quotation. Try reloading.");
      receive(result); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load quotation. Try reloading."); }
    finally { setBusy(false); }
  }
  async function mutate(body: Record<string, unknown>, confirmation: string) {
    if (!data || busy || stale) return;
    if (["ACCEPT_QUOTE", "DECLINE_QUOTE"].includes(String(body.action)) && (!data.quote || Date.parse(data.quote.expiresAt) <= quotationNow())) {
      setExpired(true); setReviewed(false); setError("This quotation has expired. Reload quotation to check the current request."); return;
    }
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, version: data.requestVersion }) });
      const result = await response.json();
      if (response.status === 409) { setStale(true); setReviewed(false); throw Error(`${result.error || "This request changed."} Reload quotation before continuing.`); }
      if (!response.ok) throw Error(result.error || "Unable to update quotation. Try again.");
      receive(result); setMessage(confirmation); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update quotation. Try again."); }
    finally { setBusy(false); }
  }
  const quote = data?.quote;
  const outcome = quote && (expired && ["PENDING", "ACCEPTED"].includes(quote.outcome) ? "EXPIRED" : quote.outcome);
  const independentOperator = data?.isOperator && !data.isOwner;
  const ready = data && ["READY_FOR_APPROVAL", "HOLD_EXPIRED"].includes(data.status);
  const canIssue = independentOperator && ready && data?.canIssue;
  const canRespond = data?.isOwner && data.canRespond && data.status === "QUOTE_PENDING" && outcome === "PENDING";
  const canWithdraw = independentOperator && data?.status === "QUOTE_PENDING" && outcome === "PENDING";
  const blocked = busy || stale;
  const exactQuote = quote ? { quoteId: quote.id, digest: quote.digest } : {};

  return <section className="context-section booking-quotation" aria-labelledby="quotation-heading" aria-busy={busy}>
    <h2 id="quotation-heading">Booking quotation</h2>
    <p>The agency may approve the reviewed request and issue a dated quotation with a temporary resource hold. A quotation is not a confirmed booking or payment receipt.</p>
    {error && <p className="error-message" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    <button type="button" className="button secondary" disabled={busy} onClick={reload}>Reload quotation</button>
    {!data && !error && <p role="status">Loading quotation…</p>}
    {data && <>
      {!quote && <p>{ready ? "Human review is complete. Awaiting agency approval and a quotation." : "No quotation has been issued for this request."}</p>}
      {quote && <>
        <h3>Quotation version {quote.revision} · {outcomeLabels[outcome!]}</h3>
        <p>Issued <time dateTime={quote.issuedAt}>{date(quote.issuedAt)}</time><br />Expires <time dateTime={quote.expiresAt}>{date(quote.expiresAt)}</time> (Philippine time)</p>
        {outcome === "PENDING" && <p className="notice">The temporary hold ends at the stated expiry. Accepting does not extend it. Agreement and payment steps are still required before booking confirmation.</p>}
        {outcome === "EXPIRED" && <p className="notice">This quotation has expired and cannot be accepted. The agency must check availability and issue a new quotation.</p>}
        {outcome === "ACCEPTED" && <p className="notice">Quotation accepted. The next step is the agreement. No payment has been recorded by this step, and the hold still ends at the stated expiry.</p>}
        {quote.lines.map(line => <div className="document-field" key={line.lineId}>
          <h4>{line.title}</h4>
          <p>{date(line.startAt)} – {date(line.endAt)} (Philippine time)<br />{line.partySize} {line.partySize === 1 ? "guest" : "guests"}{line.driverName && <><br />Assigned driver: {line.driverName}</>}</p>
          <p>Service: {money(line.serviceCentavos)}<br />Refundable deposit: {money(line.refundableDepositCentavos)}</p>
          {quote.policies.filter(policy => policy.lineId === line.lineId).map(policy => <details key={policy.lineId} open>
            <summary>Quotation policies for {line.title}</summary>
            {Object.entries(policyLabels).map(([key, label]) => <p className="preserve-lines" key={key}><strong>{label}</strong><br />{policy[key as keyof typeof policyLabels] || "None stated."}</p>)}
          </details>)}
        </div>)}
        <dl className="quotation-totals">
          <div><dt>Services</dt><dd>{money(quote.totals.serviceCentavos)}</dd></div>
          <div><dt>Refundable deposits</dt><dd>{money(quote.totals.refundableDepositCentavos)}</dd></div>
          <div><dt>Quotation total</dt><dd>{money(quote.totals.totalCentavos)}</dd></div>
        </dl>
        <p>Refundable deposits are shown separately and remain subject to the saved deposit and refund policies. This total is not a payment receipt.</p>
      </>}
      {canIssue && <fieldset disabled={blocked}>
        <legend>Approve and issue</legend>
        <p>Issuing checks current availability and places a temporary hold for every service in this request.</p>
        {data.driverSelections.map(selection => <label className="field" key={selection.lineId}>Driver for {selection.title}
          <select value={drivers[selection.lineId] || ""} onChange={event => setDrivers({ ...drivers, [selection.lineId]: event.target.value })} required>
            <option value="">Choose an eligible driver</option>
            {selection.drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
          </select>
          {!selection.drivers.length && <span>No eligible drivers are available. A quotation cannot be issued.</span>}
        </label>)}
        <button type="button" className="button" disabled={blocked || !data.driverSelections.every(selection => selection.drivers.some(driver => driver.id === drivers[selection.lineId]))} onClick={() => mutate({ action: "ISSUE_QUOTE", drivers: data.driverSelections.map(selection => ({ lineId: selection.lineId, driverId: drivers[selection.lineId] })) }, "Quotation issued with a temporary hold.")}>Approve and issue quotation</button>
      </fieldset>}
      {canRespond && <fieldset disabled={blocked}>
        <legend>Your response to quotation version {quote!.revision}</legend>
        <label className="quotation-consent"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />I have reviewed quotation version {quote!.revision}, including its service prices, refundable deposits, policies and expiry.</label>
        <button type="button" className="button" disabled={blocked || !reviewed} onClick={() => mutate({ action: "ACCEPT_QUOTE", ...exactQuote }, "Quotation acceptance recorded.")}>Accept quotation</button>
        <label className="field">Decline reason<textarea value={reason} maxLength={2000} onChange={event => setReason(event.target.value)} /></label>
        <button type="button" className="button secondary" disabled={blocked || !reason.trim()} onClick={() => mutate({ action: "DECLINE_QUOTE", ...exactQuote, reason: reason.trim() }, "Quotation declined. The temporary hold has been released.")}>Decline quotation</button>
      </fieldset>}
      {canWithdraw && <fieldset disabled={blocked}>
        <legend>Withdraw this quotation</legend>
        <label className="field">Withdrawal reason<textarea value={reason} maxLength={2000} onChange={event => setReason(event.target.value)} /></label>
        <p>Withdrawing releases the temporary hold and returns the request for approval.</p>
        <button type="button" className="button secondary" disabled={blocked || !reason.trim()} onClick={() => mutate({ action: "WITHDRAW_QUOTE", ...exactQuote, reason: reason.trim() }, "Quotation withdrawn. The temporary hold has been released.")}>Withdraw quotation</button>
      </fieldset>}
      {independentOperator && ready && <fieldset disabled={blocked}>
        <legend>Reject this request</legend>
        <label className="field">Rejection reason<textarea value={reason} maxLength={2000} onChange={event => setReason(event.target.value)} /></label>
        <button type="button" className="button secondary" disabled={blocked || !reason.trim()} onClick={() => mutate({ action: "REJECT", reason: reason.trim() }, "Request rejected.")}>Reject request</button>
      </fieldset>}
      {data.history.length > 0 && <details className="quotation-history">
        <summary>Quotation version history</summary>
        <ol>{data.history.map(item => <li key={item.id}>Version {item.revision} · {outcomeLabels[item.id === quote?.id && outcome ? outcome : item.outcome]}<br /><small>Issued {date(item.issuedAt)} · Expires {date(item.expiresAt)} (Philippine time)</small></li>)}</ol>
      </details>}
    </>}
  </section>;
}
