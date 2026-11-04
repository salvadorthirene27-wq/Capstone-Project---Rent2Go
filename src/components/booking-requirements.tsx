"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Purpose = "IDENTITY" | "DRIVER_LICENSE";
type Evidence = { id: string; purpose: Purpose; name: string; mime: string; size: number; uploadedAt: string; status: "PENDING" | "ACCEPTED" | "CHANGES_REQUESTED"; reason: string; expiresOn: string | null };
type Requirements = { requestId: string; requestVersion: number; status: string; canEdit: boolean; isReviewer: boolean; requiredPurposes: Purpose[]; documents: Evidence[] };
const labels: Record<Purpose, string> = { IDENTITY: "Identity document", DRIVER_LICENSE: "Driver license" };
const statuses: Record<string, string> = { REQUIREMENTS_PENDING: "Requirements pending", UNDER_REVIEW: "Under review", CHANGES_REQUESTED: "Changes requested", READY_FOR_APPROVAL: "Ready for approval", REJECTED: "Rejected", PENDING: "Pending review", ACCEPTED: "Accepted" };

export function BookingRequirements({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [data, setData] = useState<Requirements | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [message, setMessage] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [rejectReason, setRejectReason] = useState("");
  const endpoint = `/api/booking-requests/${encodeURIComponent(requestId)}/requirements`;
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError(""); setStale(false); setReasons({}); setRejectReason(""); setMessage("");
    fetch(endpoint, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Unable to load requirements.");
      if (!controller.signal.aborted) setData(result);
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load requirements."); });
    return () => controller.abort();
  }, [endpoint]);
  async function reload() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Unable to load requirements.");
      setData(result); setStale(false); setReasons({}); setRejectReason("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load requirements. Try again."); }
    finally { setBusy(false); }
  }
  async function mutate(method: "POST" | "PATCH", body: FormData | Record<string, unknown>, confirmation: string) {
    if (!data || busy || stale) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(endpoint, { method, ...(method === "PATCH" ? {headers:{"Content-Type":"application/json"},body:JSON.stringify({...body,version:data.requestVersion})} : {body:body as FormData}) });
      const result = await response.json();
      if (response.status === 409) { setStale(true); throw Error(`${result.error || "This request changed."} Reload requirements before continuing.`); }
      if (!response.ok) throw Error(result.error || "Unable to update requirements. Try again.");
      setData(result); setMessage(confirmation); setReasons({}); setRejectReason(""); router.refresh();
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update requirements. Try again."); }
    finally { setBusy(false); }
  }
  const editable = data?.canEdit && ["REQUIREMENTS_PENDING", "CHANGES_REQUESTED"].includes(data.status);
  const reviewing = data?.isReviewer && data.status === "UNDER_REVIEW";
  const blocked = busy || stale;
  return <section className="context-section booking-requirements" aria-labelledby="requirements-heading" aria-busy={busy}>
    <h2 id="requirements-heading">Booking requirements</h2>
    <p>Private documents are checked by an authorized human reviewer. This step does not reserve a vehicle or confirm a booking.</p>
    {error && <p className="error-message" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    <button type="button" className="button secondary" disabled={busy} onClick={reload}>Reload requirements</button>
    {!data && !error && <p role="status">Loading requirements…</p>}
    {data && <>
      <h3>{statuses[data.status] || data.status}</h3>
      {data.status === "UNDER_REVIEW" && <p>The submitted documents and expiry dates are saved as an immutable review snapshot. Replacements cannot be uploaded during review.</p>}
      {data.status === "READY_FOR_APPROVAL" && <p>Human review is complete. The request is ready for the next approval step.</p>}
      {data.status === "REJECTED" && <p>This request is closed. Its submitted documents and review history are retained.</p>}
      {data.status === "CHANGES_REQUESTED" && <p>Review the correction reasons below, upload replacements, then submit the requirements again.</p>}
      {data.requiredPurposes.map(purpose => {
        const file = data.documents.find(item => item.purpose === purpose), label = labels[purpose];
        return <div className="document-field" key={purpose}>
          <h3>{label}</h3>
          {file ? <>
            <p><a href={`/api/booking-files/${encodeURIComponent(file.id)}`} target="_blank" rel="noopener noreferrer">{file.name}</a> · {statuses[file.status]}<br/>{Math.ceil(file.size / 1024)} KB · Uploaded {file.uploadedAt.slice(0, 10)}<br/>Expiry: {file.expiresOn || "Not provided"}</p>
            {file.reason && <p className="preserve-lines"><strong>Review reason:</strong> {file.reason}</p>}
          </> : <p>No document uploaded.</p>}
          {editable && <form onSubmit={async event => {
            event.preventDefault(); const form = event.currentTarget, body = new FormData(form), selected = (form.elements.namedItem("file") as HTMLInputElement).files?.[0];
            if (!(selected instanceof File) || !selected.size) { setError(`Choose a file for ${label.toLowerCase()}.`); return; }
            if (selected.size > 8 * 1024 * 1024) { setError("Each document must be 8 MB or smaller."); return; }
            body.set("file",selected); body.set("purpose",purpose); body.set("version",String(data.requestVersion));
            if (!body.get("expiresOn")) body.delete("expiresOn");
            if (await mutate("POST",body,`${label} uploaded. Submit requirements when every required document is ready.`)) form.reset();
          }}>
            <fieldset disabled={blocked}>
              <label className="field">{label} file<input type="file" name="file" accept="image/png,image/jpeg,application/pdf" required/></label>
              <p>PNG, JPEG or PDF, up to 8 MB. Upload a clear, readable copy.</p>
              <label className="field">{label} expiry date{purpose === "IDENTITY" ? " (optional)" : ""}<input type="date" name="expiresOn" required={purpose === "DRIVER_LICENSE"}/></label>
              <p>{purpose === "DRIVER_LICENSE" ? "The license must remain valid through the end of your service." : "If an expiry is printed on the document, enter it. It must cover the end of your service."}</p>
              <button className="button" type="submit">Upload {label.toLowerCase()}</button>
            </fieldset>
          </form>}
          {reviewing && file && file.status === "PENDING" && <fieldset disabled={blocked}>
            <label className="field">{label} correction reason<textarea maxLength={2000} value={reasons[file.id] || ""} onChange={event=>setReasons({...reasons,[file.id]:event.target.value})}/></label>
            {purpose === "DRIVER_LICENSE" && !file.expiresOn && <p>A license expiry date is missing. Request a correction before accepting.</p>}
            <div className="form-actions">
              <button type="button" className="button" disabled={purpose === "DRIVER_LICENSE" && !file.expiresOn} onClick={()=>mutate("PATCH",{action:"REVIEW_DOCUMENT",fileId:file.id,decision:"ACCEPTED"},`${label} accepted.`)}>Accept {label.toLowerCase()}</button>
              <button type="button" className="button secondary" disabled={!reasons[file.id]?.trim()} onClick={()=>mutate("PATCH",{action:"REVIEW_DOCUMENT",fileId:file.id,decision:"CHANGES_REQUESTED",reason:reasons[file.id].trim()},`${label} correction recorded.`)}>Request {label.toLowerCase()} correction</button>
            </div>
          </fieldset>}
        </div>;
      })}
      {editable && <button className="button" type="button" disabled={blocked || !data.requiredPurposes.every(purpose=>data.documents.some(file=>file.purpose===purpose))} onClick={()=>mutate("PATCH",{action:"SUBMIT"},"Requirements submitted for human review.")}>Submit requirements</button>}
      {reviewing && <fieldset disabled={blocked}>
        <div className="form-actions"><button type="button" className="button secondary" onClick={()=>mutate("PATCH",{action:"START_REVIEW"},"Review started.")}>Start review</button>
        <button type="button" className="button" disabled={!data.requiredPurposes.every(purpose=>data.documents.some(file=>file.purpose===purpose && file.status!=="PENDING"))} onClick={()=>mutate("PATCH",{action:"COMPLETE_REVIEW"},"Review completed.")}>Complete review</button></div>
        <p>Complete after recording a decision for every required document. Any requested correction returns the requirements to the renter.</p>
        <label className="field">Rejection reason<textarea maxLength={2000} value={rejectReason} onChange={event=>setRejectReason(event.target.value)}/></label>
        <button type="button" className="button secondary" disabled={!rejectReason.trim()} onClick={()=>mutate("PATCH",{action:"REJECT",reason:rejectReason.trim()},"Request rejected.")}>Reject request</button>
      </fieldset>}
    </>}
  </section>;
}
