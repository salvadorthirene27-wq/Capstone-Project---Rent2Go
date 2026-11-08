import Link from 'next/link';
import {money,date} from '@/modules/partners/presentation';
import {reconciliationReasons,type PaymentReconciliation} from '@/modules/gateway/reconciliation';
const guidance:Record<keyof typeof reconciliationReasons,string>={
 CLOSED_BOOKING_FUNDS:'Preserve the closed ledger. These funds need a separate documented disposition.',
 CHANNEL_CONFLICT:'Compare the original collection channels before deciding how these funds should be handled.',
 FUNDS_REVIEW:'Verify the source and any entitlement before a refund or financial adjustment.',
 CHECKOUT_REVIEW:'Verify the original provider reference and account configuration. Do not create a replacement payable checkout while its outcome is uncertain.',
 NOTIFICATION_REVIEW:'Compare the authenticated notification with the original checkout. Conflicting facts must remain visible until independently reconciled.',
 NOTIFICATION_PENDING:'The status worker will validate this delivery. Receipt processing is separate from booking confirmation.',
 POSTING_PENDING:'The payment facts are saved. The status worker can retry booking posting without collecting again.',
 MISMATCH:'Compare the source references and accepted amount. A mismatch cannot overwrite the original payment.',
 UNMATCHED:'Locate this event in the original provider account. A notification reference alone cannot assign funds to a different booking.',
 INVALID_PAYLOAD:'Check the provider event and integration contract. No successful collection is inferred from an incomplete payload.',
 CONFLICT:'Preserve both versions and verify the provider record. The original receipt must not be overwritten.',
};
export function PaymentReconciliationList({data}:{data:PaymentReconciliation}){
 const href=(page:number)=>`/admin/payments?${new URLSearchParams({...data.query,page:String(page)})}`;
 return <>
  <form className="report-filters" method="get" action="/admin/payments" aria-label="Payment review filters"><label className="field">Records<select name="kind" defaultValue={data.query.kind}><option value="ALL">All cases</option><option value="CHECKOUT">Checkout cases</option><option value="NOTIFICATION">Unmatched notifications</option></select></label><label className="field">Provider environment<select name="mode" defaultValue={data.query.mode}><option value="ALL">All environments</option><option value="test">PayMongo test</option><option value="live">PayMongo live</option></select></label><label className="field">Reference (optional)<input name="reference" defaultValue={data.query.reference} maxLength={160} placeholder="Booking, checkout, event or case ID"/></label><button className="button" type="submit">Apply filters</button></form>
  {!data.available?<p className="notice">Online payment review records are not available yet. Payment integration must be configured before this queue can receive records.</p>:<>
   <p>{data.total} cases · {data.checkoutTotal} checkout cases · {data.notificationTotal} unmatched notification cases. Amounts below are individual references and must not be added together as a financial balance.</p>
   {!data.items.length?<p>No cases match these filters.</p>:data.items.map(item=><article className="assessment-record" key={`${item.kind}:${item.id}`}>
    <p className="page-eyebrow">{item.mode==='test'?'PayMongo test · no real charge':'PayMongo live'} · {item.kind==='CHECKOUT'?'Checkout case':'Unmatched notification'}</p>
    <h2>{reconciliationReasons[item.reason]}</h2><p>{item.agencyName??'Agency not yet matched'} · Recorded {date(item.recordedAt)}</p>
    <dl className="assessment-totals"><div><dt>{item.amountKind==='VERIFIED'?'Verified receipt amount':item.amountKind==='EXPECTED'?'Expected checkout amount':'Unmatched notification amount'}</dt><dd>{item.amountCentavos===null?'Requires provider verification':money(item.amountCentavos)}</dd></div><div><dt>Booking reference</dt><dd className="preserve-lines">{item.requestId??'Not assigned'}</dd></div></dl>
    <p>{guidance[item.reason]}</p><details className="policy-disclosure"><summary>Saved source references</summary><dl><dt>Case reference</dt><dd className="preserve-lines">{item.id}</dd><dt>Provider session</dt><dd className="preserve-lines">{item.providerId??'Not recorded'}</dd>{item.providerEventId&&<><dt>Provider event</dt><dd className="preserve-lines">{item.providerEventId}</dd></>}</dl></details>
   </article>)}
   {data.pageCount>1&&<nav className="pagination" aria-label="Payment review pages">{data.page>1&&<Link href={href(data.page-1)}>Previous</Link>}<span>Page {data.page} of {data.pageCount}</span>{data.page<data.pageCount&&<Link href={href(data.page+1)}>Next</Link>}</nav>}
  </>}
  <p>This queue records pending work. Viewing a case does not resolve it, approve a refund, release funds or change the original booking. Financial dispositions require their own verified records.</p>
 </>;
}
