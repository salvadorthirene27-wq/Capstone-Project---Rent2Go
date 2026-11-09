"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {HostedPayment} from "./hosted-payment";
import { date, money } from "@/modules/partners/presentation";

type Method = "PAYMONGO" | "CASH" | "GCASH" | "DEMO_CARD" | "DEMO_GCASH" | "DEMO_PAYPAL";
type Environment = "MANUAL" | "DEMO";
type DemoOutcome = "APPROVED" | "DECLINED" | "PENDING" | "CANCELLED";
type Attempt = {
  id: string; method: Method; environment: Environment; amountCentavos: number; reference: string;
  outcome: "SUBMITTED" | "PENDING" | "CONFIRMED" | "REJECTED" | "DECLINED" | "CANCELLED";
  submittedAt: string; reason: string | null; evidenceId: string | null; collectionId: string | null; canResolve: boolean;
};
type PaymentState = {
  channel?: "PAYMONGO" | "AGENCY"; serverNow: string; holdExpiresAt: string | null; requestId: string; requestVersion: number; status: string;
  isOwner: boolean; isOperator: boolean; canSubmitGcash: boolean; canRecordCash: boolean; canSimulate: boolean;
  canReview: boolean; canResolveDemo: boolean; allocationCommitted: boolean; holdActive: boolean;
  agreement: { id: string; digest: string; quoteId: string } | null; environment: Environment | null; methods: Method[];
  instructions: { gcashAccountName: string; gcashInstructions: string; gcashQrAvailable: boolean };
  totals: { serviceCentavos: number; refundableDepositCentavos: number; totalCentavos: number; confirmedCentavos: number; balanceCentavos: number; creditCentavos: number };
  attempts: Attempt[];
  collections: { id: string; method: Method; environment: Environment; amountCentavos: number; reference: string; recordedAt: string }[];
  requiresReconciliation: boolean;
};
const methods: Record<Method, string> = { PAYMONGO: "PayMongo \u00b7 held by Rent2Go", CASH: "Received cash", GCASH: "GCash · manual receipt review", DEMO_CARD: "Card · simulated", DEMO_GCASH: "GCash · simulated", DEMO_PAYPAL: "PayPal · simulated" };
const outcomes: Record<Attempt["outcome"], string> = { SUBMITTED: "Awaiting agency review", PENDING: "Pending simulation", CONFIRMED: "Confirmed", REJECTED: "Rejected", DECLINED: "Declined", CANCELLED: "Cancelled" };
function centavos(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split("."), result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}

export function BookingPayments({ requestId }: { requestId: string }) {
  const router = useRouter();
  const endpoint = `/api/booking-requests/${encodeURIComponent(requestId)}/payments`;
  const [data, setData] = useState<PaymentState | null>(null);
  const [busy, setBusy] = useState(true), [stale, setStale] = useState(false), [expired, setExpired] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const [environment, setEnvironment] = useState<Environment>("MANUAL");
  const [amount, setAmount] = useState(""), [reference, setReference] = useState(""), [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null), [fileRevision, setFileRevision] = useState(0);
  const [demoMethod, setDemoMethod] = useState<Method>("DEMO_CARD"), [demoOutcome, setDemoOutcome] = useState<DemoOutcome>("APPROVED");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [resolutions, setResolutions] = useState<Record<string, Exclude<DemoOutcome, "PENDING">>>({});
  const upload = useRef<HTMLInputElement>(null), inFlight = useRef(false);
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const identity = useRef("");
  const clock = useRef({ epoch: NaN, receivedAt: 0 });
  const serverNow = () => clock.current.epoch + performance.now() - clock.current.receivedAt;
  function clearInputs() {
    setAmount(""); setReference(""); setNote(""); setFile(null); setReasons({}); setResolutions({});
    setDemoOutcome("APPROVED"); retry.current = null;
    if (upload.current) upload.current.value = "";
  }
  function receive(result: PaymentState, clear = false) {
    const nextIdentity = `${result.agreement?.id || ""}:${result.agreement?.digest || ""}`;
    if (clear || nextIdentity !== identity.current) clearInputs();
    identity.current = nextIdentity;
    clock.current = { epoch: Date.parse(result.serverNow), receivedAt: performance.now() };
    setData(result); setStale(false);
    setEnvironment(result.environment || "MANUAL");
    setDemoMethod(current => result.methods.includes(current) ? current : result.methods.find(method => method.startsWith("DEMO_")) || "DEMO_CARD");
    setExpired(!Number.isFinite(clock.current.epoch) || (!result.allocationCommitted && (!result.holdExpiresAt || !(Date.parse(result.holdExpiresAt) > serverNow()))));
  }
  async function read(signal?: AbortSignal) {
    const response = await fetch(endpoint, { cache: "no-store", ...(signal ? { signal } : {}) });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || "Unable to load payments. Reload payments to try again.");
    return result as PaymentState;
  }
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setBusy(true); setError(""); setMessage(""); setStale(false); clearInputs();
    read(controller.signal).then(result => { if (!controller.signal.aborted) receive(result, true); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load payments."); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [endpoint]);
  useEffect(() => {
    if (!data || data.allocationCommitted) return;
    let timer: ReturnType<typeof setTimeout>;
    function check() {
      const remaining = Date.parse(data!.holdExpiresAt || "") - serverNow();
      if (!(remaining > 0)) { setExpired(true); return; }
      timer = setTimeout(check, Math.min(remaining, 2_147_483_647));
    }
    check(); return () => clearTimeout(timer);
  }, [data]);
  async function reload() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setMessage(""); setStale(true); clearInputs();
    try { receive(await read(), true); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load payments."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const blocked = busy || stale;
  const allocationUsable = Boolean(data && data.holdActive && !expired && Number.isFinite(clock.current.epoch));
  const manual = environment === "MANUAL" && data?.environment !== "DEMO";
  const demo = environment === "DEMO" && data?.environment !== "MANUAL";
  const gcash = Boolean(data?.isOwner && data.canSubmitGcash && data.methods.includes("GCASH") && data.agreement && manual && allocationUsable);
  const cash = Boolean(data?.isOperator && !data.isOwner && data.canRecordCash && data.methods.includes("CASH") && data.agreement && manual && allocationUsable);
  const simulate = Boolean(data?.isOwner && data.canSimulate && data.agreement && demo && allocationUsable && data.totals.balanceCentavos > 0 && data.methods.includes(demoMethod));
  function chooseFile(selected?: File) {
    setFile(null); setFileRevision(value => value + 1); setError("");
    if (!selected) return;
    if (!["image/png", "image/jpeg", "application/pdf"].includes(selected.type)) { setError("Choose a PNG, JPEG or PDF receipt."); if (upload.current) upload.current.value = ""; return; }
    if (!selected.size || selected.size > 5 * 1024 * 1024) { setError("The receipt must be nonempty and 5 MB or smaller."); if (upload.current) upload.current.value = ""; return; }
    setFile(selected);
  }
  async function submit(action: "EVIDENCE" | "RECORD_CASH" | "SIMULATE_PAYMENT" | "REVIEW_GCASH" | "RESOLVE_DEMO", attempt?: Attempt, decision?: "CONFIRM" | "REJECT") {
    if (!data || blocked || inFlight.current) return;
    const currentAllocation = data.holdActive && Number.isFinite(serverNow()) && (data.allocationCommitted || Date.parse(data.holdExpiresAt || "") > serverNow());
    if (action !== "REVIEW_GCASH" && !currentAllocation) { setExpired(true); setError("The temporary allocation has expired. Reload payments to check availability."); return; }
    let command: Record<string, string | number> = { version: data.requestVersion };
    const exactAgreement = data.agreement && { agreementId: data.agreement.id, digest: data.agreement.digest };
    const value = centavos(amount), ref = reference.trim();
    if (action === "EVIDENCE" || action === "RECORD_CASH") {
      if (!exactAgreement || value === null || !ref || (action === "EVIDENCE" ? !gcash || !file : !cash || !note.trim())) return;
      command = { ...command, ...exactAgreement, amountCentavos: value, reference: ref, ...(action === "RECORD_CASH" ? { action, note: note.trim() } : {}) };
    } else if (action === "SIMULATE_PAYMENT") {
      if (!simulate || !exactAgreement) return;
      command = { ...command, ...exactAgreement, action, method: demoMethod, outcome: demoOutcome };
    } else if (action === "REVIEW_GCASH") {
      if (!attempt || !decision || !data.canReview || !data.isOperator || data.isOwner || attempt.method !== "GCASH" || attempt.environment !== "MANUAL" || attempt.outcome !== "SUBMITTED" || !reasons[attempt.id]?.trim()) return;
      command = { ...command, action, attemptId: attempt.id, decision, reason: reasons[attempt.id].trim() };
    } else {
      if (!attempt || !attempt.canResolve || !data.canResolveDemo || !data.isOwner || attempt.environment !== "DEMO" || attempt.outcome !== "PENDING") return;
      command = { ...command, action, attemptId: attempt.id, outcome: resolutions[attempt.id] || "APPROVED" };
    }
    const fingerprint = JSON.stringify([action, command, action === "EVIDENCE" ? fileRevision : null]);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    command.idempotencyKey = retry.current.key;
    inFlight.current = true; setBusy(true); setError(""); setMessage("");
    let applied = false;
    try {
      let options: RequestInit;
      if (action === "EVIDENCE") {
        const body = new FormData(); Object.entries(command).forEach(([key, entry]) => body.set(key, String(entry))); body.set("file", file!);
        options = { method: "POST", body };
      } else options = { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) };
      const response = await fetch(action === "EVIDENCE" ? `${endpoint}/evidence` : endpoint, options), result = await response.json();
      if (response.status === 409) { setStale(true); clearInputs(); throw Error(`${result.error || "This booking changed."} Reload payments before continuing.`); }
      if (!response.ok) throw Error(result.error || "Unable to record this payment action. Try again.");
      applied = true; receive(result, true);
      // Keep controls locked until the fresh capabilities and balances have arrived.
      receive(await read(), true); router.refresh();
      setMessage(action === "EVIDENCE" ? "GCash evidence submitted for agency review. Uploading does not confirm payment." : action === "SIMULATE_PAYMENT" || action === "RESOLVE_DEMO" ? "Simulation result recorded. No payment was processed." : "Payment record updated. Review the confirmed balance below.");
    } catch (cause) {
      if (applied) { setStale(true); setError("The action was recorded, but the latest payment state could not be loaded. Reload payments before continuing."); }
      else setError(cause instanceof Error ? cause.message : "Unable to record this payment action. Try again.");
    } finally { inFlight.current = false; setBusy(false); }
  }
  const receiptLink = (id: string, mode: Environment, method?: Method) => <Link href={`/booking-payments/${encodeURIComponent(id)}`}>{mode === "DEMO" ? method === "PAYMONGO" ? "View PayMongo test payment record" : "View simulated payment record" : "View payment receipt"}</Link>;
  return <section className="context-section booking-payments" aria-labelledby="payments-heading" aria-busy={busy}>
    {data&&["FULFILLMENT_RECONCILIATION_PENDING","CANCELLED_RECONCILIATION_PENDING","PAYMENT_RECONCILIATION_REQUIRED","CANCELLED","COMPLETED","HOLD_EXPIRED"].includes(data.status)&&<p className="notice">These are the original quotation payment records. Quoted balances are historical references; use <a href="#settlement-heading">Settlement</a> for current retained charges, additional balances and refunds.</p>}
    <div className="payment-section-heading"><h2 id="payments-heading">Booking payments</h2><button type="button" className="button secondary" disabled={busy} onClick={reload}>Reload payments</button></div>
    <p>{data?.channel === "PAYMONGO" ? "Online payment results are verified with PayMongo. Rent2Go holds the funds; deposits and agency disbursements remain separate." : "Record payment against the signed agreement. GCash evidence needs agency review; cash is recorded by the receiving agency."}</p>
    {data&&(data.methods.includes("PAYMONGO")||data.channel==="PAYMONGO")&&<HostedPayment requestId={requestId} source={data}/>}
    {error && <p role="alert" className="error-message">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!data && !error && <p role="status">Loading payments…</p>}
    {data && <>
      {!data.agreement ? <p>Sign the current agreement before making a payment. No payable balance is available yet.</p> : <>
        <dl className="payment-totals">
          <div><dt>Quoted services</dt><dd>{money(data.totals.serviceCentavos)}</dd></div>
          <div><dt>Refundable deposits</dt><dd>{money(data.totals.refundableDepositCentavos)}</dd></div>
          <div><dt>Total due before service</dt><dd>{money(data.totals.totalCentavos)}</dd></div>
          <div><dt>{data.environment === "DEMO" ? data.channel === "PAYMONGO" ? "PayMongo test payments" : "Recorded simulated amount" : "Confirmed payments"}</dt><dd>{money(data.totals.confirmedCentavos)}</dd></div>
          <div><dt>{data&&["FULFILLMENT_RECONCILIATION_PENDING","CANCELLED_RECONCILIATION_PENDING","PAYMENT_RECONCILIATION_REQUIRED","CANCELLED","COMPLETED","HOLD_EXPIRED"].includes(data.status)?"Original quote balance, for reference":"Outstanding balance"}</dt><dd>{money(data.totals.balanceCentavos)}</dd></div>
          {data.totals.creditCentavos > 0 && <div><dt>Unapplied credit</dt><dd>{money(data.totals.creditCentavos)}</dd></div>}
        </dl>
        <p>Both quoted services and refundable deposits must be fully covered before service readiness. Deposits remain separate from service revenue.</p>
        {data.totals.creditCentavos > 0 && <p>Overpayment is held as unapplied credit for reconciliation.</p>}
      </>}
      {data.requiresReconciliation && <p className="notice"><strong>Reconciliation required.</strong> Funds recorded after the allocation expired cannot authorize service release. The agency must reconcile this payment.</p>}
      {data.allocationCommitted ? <p className="notice">Inventory allocation is committed. A partial payment retains the allocation but does not authorize service release.</p> : data.agreement && (!data.holdActive || expired) && <p className="notice">The temporary allocation has expired. Reload payments to check the current booking. Submitted evidence remains available for agency review.</p>}
      {data.agreement && data.channel !== "PAYMONGO" && <fieldset className="payment-environment" disabled={blocked}>
        <legend>Payment environment</legend>
        <label><input type="radio" name={`payment-environment-${requestId}`} checked={environment === "MANUAL"} disabled={data.environment === "DEMO"} onChange={() => { setEnvironment("MANUAL"); clearInputs(); }} />Manual GCash or cash</label>
        <label><input type="radio" name={`payment-environment-${requestId}`} checked={environment === "DEMO"} disabled={data.environment === "MANUAL" || !data.methods.some(method => method.startsWith("DEMO_"))} onChange={() => { setEnvironment("DEMO"); clearInputs(); }} />Simulated payment · no charge</label>
        <p>{data.environment ? `This quotation is locked to ${data.environment === "MANUAL" ? "manual payments" : "simulated payments"}.` : "Agency collections and simulated payments are recorded separately for each quotation."}</p>
      </fieldset>}
      {manual && data.isOwner && data.methods.includes("CASH") && <p>Paying cash? The agency records payment after receiving the money.</p>}
      {gcash && <form onSubmit={event => { event.preventDefault(); void submit("EVIDENCE"); }}>
        <fieldset disabled={blocked} className="payment-form"><legend>Submit GCash evidence</legend>
          <div className="payment-instructions"><strong>{data.instructions.gcashAccountName}</strong><p>{data.instructions.gcashInstructions}</p>{data.instructions.gcashQrAvailable && <a href={`${endpoint}/gcash-qr`}>View agency GCash QR</a>}<p>These instructions come from the policy saved with this quotation. Uploading a receipt does not confirm received funds.</p></div>
          <label>GCash amount (PHP)<input inputMode="decimal" autoComplete="off" value={amount} onChange={event => setAmount(event.target.value)} aria-invalid={Boolean(amount && centavos(amount) === null)} aria-describedby="gcash-amount-help" required /></label>
          <p id="gcash-amount-help">Enter a positive PHP amount with up to two decimal places. Partial payments and overpayments are recorded separately from readiness.</p>
          <label>GCash reference<input value={reference} onChange={event => setReference(event.target.value)} maxLength={160} autoComplete="off" required /></label>
          <label>GCash receipt file<input ref={upload} type="file" accept="image/png,image/jpeg,application/pdf" onChange={event => chooseFile(event.target.files?.[0])} aria-required="true" /></label>
          <p>PNG, JPEG or PDF, up to 5 MB. Evidence is private to authorized booking participants.</p>
          <button className="button" type="submit" disabled={blocked || centavos(amount) === null || !reference.trim() || !file}>Submit GCash evidence</button>
        </fieldset>
      </form>}
      {cash && <form onSubmit={event => { event.preventDefault(); void submit("RECORD_CASH"); }}><fieldset disabled={blocked} className="payment-form"><legend>Record cash received</legend>
        <p>Record funds you have received. Your authenticated receiver identity and the server time are saved with the collection.</p>
        <label>Cash amount (PHP)<input inputMode="decimal" autoComplete="off" value={amount} onChange={event => setAmount(event.target.value)} aria-invalid={Boolean(amount && centavos(amount) === null)} aria-describedby="cash-amount-help" required /></label>
        <p id="cash-amount-help">Enter the positive PHP amount actually received, with up to two decimal places.</p>
        <label>Cash reference<input value={reference} onChange={event => setReference(event.target.value)} maxLength={160} autoComplete="off" required /></label>
        <label>Cash receiver note<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={2000} required /></label>
        <button className="button" type="submit" disabled={blocked || centavos(amount) === null || !reference.trim() || !note.trim()}>Record received cash</button>
      </fieldset></form>}
      {demo && <div className="payment-demo"><h3>Simulated payment · no charge</h3><p>Simulated outcomes only. Use the fixed options below; no payment credentials are collected.</p>
        {simulate && <form onSubmit={event => { event.preventDefault(); void submit("SIMULATE_PAYMENT"); }}><fieldset disabled={blocked} className="payment-form"><legend>Simulate the outstanding balance — no money moves</legend>
          <p>Simulation amount: {money(data.totals.balanceCentavos)} — no money moves</p>
          <label>Simulated payment method<select value={demoMethod} onChange={event => setDemoMethod(event.target.value as Method)}>{data.methods.filter(method => method.startsWith("DEMO_")).map(method => <option key={method} value={method}>{methods[method]}</option>)}</select></label>
          <label>Simulation result<select value={demoOutcome} onChange={event => setDemoOutcome(event.target.value as DemoOutcome)}><option value="APPROVED">Approved — no money moves</option><option value="DECLINED">Declined — no money moves</option><option value="PENDING">Pending — no money moves</option><option value="CANCELLED">Cancelled — no money moves</option></select></label>
          <button className="button" type="submit" disabled={blocked}>Simulate payment — no money moves</button>
        </fieldset></form>}
      </div>}
      <div className="payment-history"><h3>Payment history</h3><p>Submitted evidence and pending simulations do not count as confirmed payment. Earlier quotation records remain historical.</p>
        {!data.attempts.length && !data.collections.length ? <p>No payment attempts have been recorded.</p> : <ul>{data.attempts.map(attempt => <li key={attempt.id}>
          {attempt.environment === "DEMO" && <strong className="payment-demo-label">{data.channel === "PAYMONGO" ? "PayMongo test payment \u00b7 no charge" : "Simulated payment \u00b7 no charge"}</strong>}
          <div className="payment-history-heading"><strong>{methods[attempt.method]}</strong><span>{outcomes[attempt.outcome]}</span></div>
          <p>{money(attempt.amountCentavos)} · Reference: {attempt.reference} · {date(attempt.submittedAt)}</p>
          {attempt.reason && <p>Review reason: <span>{attempt.reason}</span></p>}
          <div className="payment-links">{attempt.evidenceId && <a href={`/api/booking-payment-files/${encodeURIComponent(attempt.evidenceId)}`}>View private evidence</a>}{attempt.collectionId && receiptLink(attempt.collectionId, attempt.environment, attempt.method)}</div>
          {data.canReview && data.isOperator && !data.isOwner && attempt.method === "GCASH" && attempt.environment === "MANUAL" && attempt.outcome === "SUBMITTED" && <fieldset disabled={blocked} className="payment-review"><legend>Review GCash reference {attempt.reference}</legend>
            <label>Review reason for {attempt.reference}<textarea value={reasons[attempt.id] || ""} onChange={event => setReasons(current => ({ ...current, [attempt.id]: event.target.value }))} maxLength={2000} required /></label>
            <div className="actions"><button type="button" className="button" disabled={blocked || !reasons[attempt.id]?.trim()} onClick={() => submit("REVIEW_GCASH", attempt, "CONFIRM")}>Confirm GCash receipt</button><button type="button" className="button secondary" disabled={blocked || !reasons[attempt.id]?.trim()} onClick={() => submit("REVIEW_GCASH", attempt, "REJECT")}>Reject GCash receipt</button></div>
          </fieldset>}
          {data.canResolveDemo && attempt.canResolve && data.isOwner && allocationUsable && attempt.environment === "DEMO" && attempt.outcome === "PENDING" && <fieldset disabled={blocked} className="payment-review"><legend>Resolve pending simulated payment</legend>
            <label>Resolve simulation result for {attempt.reference} — no money moves<select value={resolutions[attempt.id] || "APPROVED"} onChange={event => setResolutions(current => ({ ...current, [attempt.id]: event.target.value as Exclude<DemoOutcome, "PENDING"> }))}><option value="APPROVED">Approved — no money moves</option><option value="DECLINED">Declined — no money moves</option><option value="CANCELLED">Cancelled — no money moves</option></select></label>
            <button type="button" className="button" disabled={blocked} onClick={() => submit("RESOLVE_DEMO", attempt)}>Resolve simulated payment</button>
          </fieldset>}
        </li>)}{data.collections.filter(collection => !data.attempts.some(attempt => attempt.collectionId === collection.id)).map(collection => <li key={collection.id}>
          {collection.environment === "DEMO" && <strong className="payment-demo-label">{data.channel === "PAYMONGO" ? "PayMongo test payment \u00b7 no charge" : "Simulated payment \u00b7 no charge"}</strong>}
          <div className="payment-history-heading"><strong>{methods[collection.method]}</strong><span>Confirmed</span></div><p>{money(collection.amountCentavos)} · Reference: {collection.reference} · {date(collection.recordedAt)}</p>{receiptLink(collection.id, collection.environment, collection.method)}
        </li>)}</ul>}
      </div>
    </>}
  </section>;
}
