import {date,money,methodLabels} from "@/modules/partners/presentation";
import type {getRefundReceipt} from "@/modules/bookings/refund";
export function RefundReceiptDocument({receipt:r}:{receipt:Awaited<ReturnType<typeof getRefundReceipt>>["receipt"]}){
 return <article className="agreement-document">
  {r.environment==="DEMO"&&<p className="notice"><strong>Simulated refund · no transfer</strong></p>}
  <p><strong>{r.agencyName}</strong><br/>Refund recipient: {r.renterName}</p>
  <dl className="agreement-totals"><div><dt>Recorded refund</dt><dd>{money(r.amountCentavos)}</dd></div><div><dt>Method</dt><dd>{methodLabels[r.method as keyof typeof methodLabels]??r.method}</dd></div><div><dt>Outgoing reference</dt><dd>{r.reference}</dd></div><div><dt>Recorded time</dt><dd>{date(r.recordedAt)} (Philippine time)</dd></div><div><dt>Original collection reference</dt><dd>{r.collectionReference}</dd></div></dl>
  <p className="preserve-lines">Refund request reason: {r.reason}</p>
  {r.evidenceId&&<p><a href={`/api/booking-refund-files/${encodeURIComponent(r.evidenceId)}`} target="_blank" rel="noreferrer">View private refund execution evidence</a></p>}
  <p>{r.environment==="DEMO"?"This record preserves a simulated refund result. No actual refund was sent.":"This records an agency-entered external refund and its evidence. Rent2Go does not execute or independently confirm a provider transfer."} Check the booking request for current deposit, charges and financial reconciliation. This record does not itself complete the booking.</p>
  <p>Refund record: {r.id}<br/>Source collection: {r.collectionId}</p>
 </article>;
}
