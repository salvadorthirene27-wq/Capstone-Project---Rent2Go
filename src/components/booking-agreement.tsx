"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { date } from "@/modules/partners/presentation";
import { AgreementDocument, type AgreementBody } from "@/components/agreement-document";

type Outcome = "PENDING" | "SIGNED" | "WITHDRAWN" | "EXPIRED";
type Agreement = {
  id: string; revision: number; digest: string; quoteId: string; quoteDigest: string;
  issuedAt: string; expiresAt: string; templateVersion: string; body: AgreementBody; outcome: Outcome;
  signature: { id: string; signerName: string; signedAt: string } | null;
};
type AgreementState = {
  serverNow: string; requestId: string; requestVersion: number; status: string;
  isOwner: boolean; isOperator: boolean; canIssue: boolean; canSign: boolean; holdActive: boolean;
  acceptedQuote: { id: string; digest: string } | null; agreement: Agreement | null;
  history: { id: string; revision: number; issuedAt: string; outcome: Outcome }[];
};
const outcomeLabels: Record<Outcome, string> = { PENDING: "Awaiting signature", SIGNED: "Signed", WITHDRAWN: "Withdrawn", EXPIRED: "Expired" };
const stageLabels: Record<string, string> = { AGREEMENT_PENDING: "Agreement awaiting signature", AGREEMENT_SIGNED: "Agreement signed", QUOTE_ACCEPTED: "Quotation accepted", HOLD_EXPIRED: "Temporary hold expired", QUOTE_PENDING: "Quotation awaiting response", UNDER_REVIEW: "Requirements under review", READY_FOR_APPROVAL: "Ready for agency approval", REQUIREMENTS_PENDING: "Requirements pending", REJECTED: "Request rejected", CANCELLED: "Request cancelled" };
const cleanName = (value: string) => value.normalize("NFKC").trim().replace(/\s+/gu, " ");

export function BookingAgreement({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [data, setData] = useState<AgreementState | null>(null);
  const [busy, setBusy] = useState(true), [stale, setStale] = useState(false), [expired, setExpired] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const [name, setName] = useState(""), [consent, setConsent] = useState(false), [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null), [hasInk, setHasInk] = useState(false), [canvasUnavailable, setCanvasUnavailable] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null), upload = useRef<HTMLInputElement>(null);
  const drawing = useRef<number | null>(null), inFlight = useRef(false);
  const clock = useRef({ epoch: 0, receivedAt: 0 });
  const endpoint = `/api/booking-requests/${encodeURIComponent(requestId)}/agreement`;
  const agreementNow = () => clock.current.epoch + performance.now() - clock.current.receivedAt;

  function clearEvidence() {
    setName(""); setConsent(false); setFile(null); setHasInk(false); setReason(""); drawing.current = null;
    if (upload.current) upload.current.value = "";
    // Assigning width resets the bitmap without requiring a canvas context (upload-only browsers).
    if (canvas.current) canvas.current.width = 720;
  }
  function receive(result: AgreementState) {
    const epoch = Date.parse(result.serverNow);
    // Without a valid server clock, fail closed until a fresh response is available.
    clock.current = { epoch: Number.isFinite(epoch) ? epoch : Infinity, receivedAt: performance.now() };
    setData(result); setStale(false); clearEvidence();
    setExpired(Boolean(result.agreement && Date.parse(result.agreement.expiresAt) <= agreementNow()));
  }
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setBusy(true); setStale(false); setError(""); setMessage(""); clearEvidence();
    fetch(endpoint, { cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Unable to load agreement. Try reloading.");
      if (!controller.signal.aborted) receive(result);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load agreement. Try reloading."); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [endpoint]);
  useEffect(() => {
    if (!data?.agreement) return;
    const deadline = Date.parse(data.agreement.expiresAt);
    let timer: ReturnType<typeof setTimeout>;
    function check() {
      const remaining = deadline - agreementNow();
      if (!(remaining > 0)) { setExpired(true); setConsent(false); return; }
      timer = setTimeout(check, Math.min(remaining, 2_147_483_647));
    }
    check();
    return () => clearTimeout(timer);
  }, [data]);

  async function reload() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setMessage(""); clearEvidence();
    try {
      const response = await fetch(endpoint, { cache: "no-store" }), result = await response.json();
      if (!response.ok) throw Error(result.error || "Unable to load agreement. Try reloading.");
      receive(result); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load agreement. Try reloading."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function submit(kind: "ISSUE_AGREEMENT" | "WITHDRAW_AGREEMENT" | "SIGN") {
    if (!data || inFlight.current || busy || stale) return;
    const agreement = data.agreement;
    if (kind !== "ISSUE_AGREEMENT" && (!agreement || Date.parse(agreement.expiresAt) <= agreementNow())) {
      setExpired(true); setConsent(false); setError("The temporary hold has expired. Reload agreement to check the current request."); return;
    }
    inFlight.current = true; setBusy(true); setError(""); setMessage("");
    try {
      let options: RequestInit;
      if (kind === "SIGN") {
        if (!agreement || !consent || !cleanName(name) || cleanName(name).toLocaleLowerCase("en-US") !== cleanName(agreement.body.renterName).toLocaleLowerCase("en-US")) throw Error("Enter the full renter name shown in the agreement and give explicit consent.");
        let evidence: File | null = file;
        if (!evidence && hasInk && canvas.current) {
          const blob = await new Promise<Blob | null>(resolve => canvas.current!.toBlob(resolve, "image/png"));
          if (blob) evidence = new File([blob], "drawn-signature.png", { type: "image/png" });
        }
        if (!evidence) throw Error("Draw a signature or upload a PNG or JPEG image before signing.");
        if (evidence.size > 1024 * 1024) throw Error("The signature image must be 1 MB or smaller.");
        const form = new FormData();
        form.set("file", evidence); form.set("version", String(data.requestVersion)); form.set("agreementId", agreement.id);
        form.set("digest", agreement.digest); form.set("signerName", cleanName(name)); form.set("consent", "true");
        options = { method: "POST", body: form };
      } else {
        const body = kind === "ISSUE_AGREEMENT"
          ? { action: kind, version: data.requestVersion, quoteId: data.acceptedQuote?.id, digest: data.acceptedQuote?.digest }
          : { action: kind, version: data.requestVersion, agreementId: agreement!.id, digest: agreement!.digest, reason: reason.trim() };
        options = { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
      }
      const response = await fetch(kind === "SIGN" ? `${endpoint}/sign` : endpoint, options), result = await response.json();
      if (response.status === 409) { setStale(true); clearEvidence(); throw Error(`${result.error || "This request changed."} Reload agreement before continuing.`); }
      if (!response.ok) throw Error(result.error || "Unable to update agreement. Try again.");
      receive(result);
      setMessage(kind === "SIGN" ? "Electronic consent recorded for this exact agreement. No payment has been recorded by this step." : kind === "ISSUE_AGREEMENT" ? "Agreement prepared for renter review." : "Agreement withdrawn. The accepted quotation and its original hold deadline remain unchanged.");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update agreement. Try again."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  function clearDrawing() {
    if (canvas.current) canvas.current.width = 720;
    drawing.current = null; setHasInk(false);
  }
  function chooseFile(selected?: File) {
    setFile(null); setError(""); clearDrawing();
    if (!selected) return;
    if (!["image/png", "image/jpeg"].includes(selected.type)) { setError("Choose a PNG or JPEG signature image."); if (upload.current) upload.current.value = ""; return; }
    if (!selected.size || selected.size > 1024 * 1024) { setError("The signature image must be nonempty and 1 MB or smaller."); if (upload.current) upload.current.value = ""; return; }
    setFile(selected);
  }
  function draw(event: PointerEvent<HTMLCanvasElement>, start: boolean) {
    if (busy || stale || (start && event.button !== 0)) return;
    if (!start && drawing.current !== event.pointerId) return;
    const element = canvas.current;
    let context: CanvasRenderingContext2D | null = null;
    try { context = element?.getContext("2d") ?? null; } catch { /* Upload is the accessible fallback. */ }
    if (!element || !context) { setCanvasUnavailable(true); return; }
    const bounds = element.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const x = (event.clientX - bounds.left) * element.width / bounds.width, y = (event.clientY - bounds.top) * element.height / bounds.height;
    if (start) {
      drawing.current = event.pointerId; element.setPointerCapture?.(event.pointerId);
      setFile(null); if (upload.current) upload.current.value = "";
      context.beginPath(); context.fillStyle = "#171717"; context.arc(x, y, 1.5, 0, Math.PI * 2); context.fill();
      context.beginPath(); context.moveTo(x, y);
    } else {
      context.lineWidth = 3; context.lineCap = "round"; context.lineJoin = "round"; context.strokeStyle = "#171717"; context.lineTo(x, y); context.stroke();
    }
    setHasInk(true);
  }
  const agreement = data?.agreement, blocked = busy || stale;
  const outcome = agreement && (agreement.outcome === "PENDING" && (expired || !data?.holdActive) ? "EXPIRED" : agreement.outcome);
  const independentOperator = data?.isOperator && !data.isOwner;
  const currentQuote = agreement && data?.acceptedQuote?.id === agreement.quoteId && data.acceptedQuote.digest === agreement.quoteDigest;
  const canIssue = independentOperator && data?.canIssue && data.status === "QUOTE_ACCEPTED" && data.holdActive && data.acceptedQuote;
  const canSign = data?.isOwner && data.canSign && data.status === "AGREEMENT_PENDING" && data.holdActive && currentQuote && outcome === "PENDING";
  const canWithdraw = independentOperator && data?.status === "AGREEMENT_PENDING" && data.holdActive && currentQuote && outcome === "PENDING";
  const nameMatches = agreement && cleanName(name).toLocaleLowerCase("en-US") === cleanName(agreement.body.renterName).toLocaleLowerCase("en-US");

  return <section className="context-section booking-agreement" aria-labelledby="agreement-heading" aria-busy={busy}>
    <h2 id="agreement-heading">Booking agreement</h2>
    <p>Review the agreement prepared from your accepted quotation. Signing records electronic consent and keeps the original temporary hold deadline.</p>
    {error && <p className="error-message" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    <button type="button" className="button secondary" disabled={busy} onClick={reload}>Reload agreement</button>
    {!data && !error && <p role="status">Loading agreement…</p>}
    {data && <>
      <p className="agreement-stage">Current request stage: <strong>{stageLabels[data.status] || data.status.replaceAll("_", " ").toLowerCase()}</strong></p>
      {!agreement && <p>{data.status === "QUOTE_ACCEPTED" ? "The accepted quotation is ready for the agency to prepare an agreement." : "No agreement has been prepared. Requirements review and quotation acceptance come first."}</p>}
      {agreement && <>
        <h3>Agreement version {agreement.revision} · {outcomeLabels[outcome!]}</h3>
        <p><Link href={`/booking-agreements/${encodeURIComponent(agreement.id)}`} prefetch={false}>View printable agreement</Link></p>
        <AgreementDocument revision={agreement.revision} issuedAt={agreement.issuedAt} expiresAt={agreement.expiresAt} body={agreement.body} signature={agreement.signature} />
        {(expired || !data.holdActive || data.status === "HOLD_EXPIRED") && <p className="notice">The temporary hold has expired or is no longer active. This agreement remains a historical record and does not authorize a new quotation. The agency must check availability and issue a new quotation.</p>}
        {!currentQuote && data.holdActive && !expired && <p className="notice">This historical agreement does not authorize a new quotation. Review and sign the agreement prepared for the current accepted quotation.</p>}
        {agreement.outcome === "SIGNED" && data.status === "AGREEMENT_SIGNED" && currentQuote && data.holdActive && !expired && <p className="notice">Agreement signed. Payment is a later step; signing does not confirm a paid booking or extend the hold.</p>}
        {agreement.outcome === "WITHDRAWN" && <p className="notice">This agreement was withdrawn and cannot be signed. Any replacement requires a new agreement version.</p>}
      </>}
      {canIssue && <fieldset disabled={blocked}>
        <legend>Prepare the agreement</legend>
        <p>The document uses the exact accepted quotation, its prices and saved policies. Preparing it does not extend the existing hold.</p>
        <button type="button" className="button" onClick={() => submit("ISSUE_AGREEMENT")}>Prepare agreement</button>
      </fieldset>}
      {canSign && <fieldset disabled={blocked}>
        <legend>Sign agreement version {agreement!.revision}</legend>
        <p>Use the full renter name shown in this document. Draw your signature below or upload a signature image. Your name and signature are private to authorized request participants.</p>
        <label className="field">Full signer name<input autoComplete="off" maxLength={160} value={name} onChange={event => setName(event.target.value)} aria-describedby="agreement-name-help" /></label>
        <p id="agreement-name-help">Name on agreement: {agreement!.body.renterName}. A matching name records consistency; it does not certify identity or handwriting authenticity.</p>
        <div className="agreement-signature-input">
          <p id="agreement-draw-help">Draw a signature using a pointer or touch. You can also upload an image using the labeled field below.</p>
          <canvas ref={canvas} width={720} height={220} aria-label="Draw your signature" aria-describedby="agreement-draw-help" onPointerDown={event => draw(event, true)} onPointerMove={event => draw(event, false)} onPointerUp={() => { drawing.current = null; }} onPointerCancel={() => { drawing.current = null; }} onLostPointerCapture={() => { drawing.current = null; }} />
          <button type="button" className="button secondary" disabled={blocked || !hasInk} onClick={clearDrawing}>Clear drawn signature</button>
          {canvasUnavailable && <p role="status">Drawing is unavailable in this browser. Upload a PNG or JPEG signature image instead.</p>}
          <label className="field">Upload a signature image<input ref={upload} type="file" accept="image/png,image/jpeg" onChange={event => chooseFile(event.target.files?.[0])} aria-describedby="agreement-upload-help" /></label>
          <p id="agreement-upload-help">PNG or JPEG, up to 1 MB. A new upload replaces the drawn signature.</p>
          {file && <p role="status">Selected image: {file.name}</p>}
          {hasInk && <p role="status">Drawn signature ready.</p>}
        </div>
        <label className="agreement-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />I have read agreement version {agreement!.revision}, its services, prices, refundable deposits, saved policies and expiry, and explicitly consent to sign this exact agreement electronically.</label>
        <button type="button" className="button" disabled={blocked || !consent || !nameMatches || (!file && !hasInk)} onClick={() => submit("SIGN")}>Sign agreement</button>
      </fieldset>}
      {canWithdraw && <fieldset disabled={blocked}>
        <legend>Withdraw this pending agreement</legend>
        <label className="field">Agreement withdrawal reason<textarea maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /></label>
        <p>The document remains in history. The accepted quotation and its original hold deadline stay in place.</p>
        <button type="button" className="button secondary" disabled={blocked || !reason.trim()} onClick={() => submit("WITHDRAW_AGREEMENT")}>Withdraw agreement</button>
      </fieldset>}
      {data.history.length > 0 && <details className="agreement-history"><summary>Agreement version history</summary><ol>{data.history.map(item => <li key={item.id}>Version {item.revision} · {outcomeLabels[item.id === agreement?.id && outcome ? outcome : item.outcome]}<br /><small>Issued {date(item.issuedAt)} (Philippine time)</small></li>)}</ol><p>Earlier signatures apply only to their own agreement and accepted quotation.</p></details>}
    </>}
  </section>;
}
