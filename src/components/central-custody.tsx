import type {getCentralCustody} from '@/modules/gateway/custody';
import {money,date} from '@/modules/partners/presentation';
type Custody=Awaited<ReturnType<typeof getCentralCustody>>;
export function CentralCustody({data}:{data:Custody}){
 if(!data.available||!data.receipts.length)return null;
 const p=data.position;
 return <details className="assessment-record"><summary>Central payment custody · {money(data.verifiedGrossCentavos)} verified</summary>
  <p>Rent2Go holds these PayMongo collections. Provider net receipts do not establish a bank settlement or an agency disbursement. Refundable deposits remain separate from revenue.</p>
  <dl className="assessment-totals"><div><dt>Verified gross receipts</dt><dd>{money(data.verifiedGrossCentavos)}</dd></div><div><dt>Provider fees, borne by agency</dt><dd>{money(data.providerFeesCentavos)}</dd></div><div><dt>Provider net receipts</dt><dd>{money(data.providerNetReceiptsCentavos)}</dd></div></dl>
  {p&&<><h3>Closed revenue allocation</h3><dl className="assessment-totals"><div><dt>Protected Cosigner allocation</dt><dd>{money(p.originalAllocations.cosigner)}</dd></div><div><dt>Protected maintenance allocation</dt><dd>{money(p.originalAllocations.maintenance)}</dd></div><div><dt>Platform commission held centrally</dt><dd>{money(p.heldPlatformCommissionCentavos)}</dd></div><div><dt>Agency share after provider fees</dt><dd>{money(p.agencyNetShareCentavos)}</dd></div><div><dt>Agency fee shortfall</dt><dd>{money(p.agencyFeeShortfallCentavos)}</dd></div><div><dt>Combined agency entitlement before disbursement</dt><dd>{money(p.combinedAgencyEntitlementCentavos)}</dd></div></dl><p>Centrally held commission is excluded from agency remittance dues. Owner allocations become available at the agency only through a separate documented disbursement.</p></>}
  {data.blockedReason&&<p className="notice">{data.blockedReason}</p>}
  <details><summary>Verified provider receipt references</summary>{data.receipts.map(r=><article className="assessment-record" key={r.receiptId}><h3>{r.mode==='test'?'PayMongo test · no real charge':'PayMongo live'}</h3><p>Verified {date(r.verifiedAt)} · Gross {money(r.grossCentavos)} · Fee {money(r.feeCentavos)} · Net {money(r.netCentavos)}</p>{r.deductions&&<dl className="assessment-totals"><div><dt>Processing fee</dt><dd>{money(r.deductions.processingFeeCentavos)}</dd></div><div><dt>Foreign-card fee</dt><dd>{money(r.deductions.foreignFeeCentavos)}</dd></div><div><dt>Inclusive withholding-tax credit</dt><dd>{money(r.deductions.taxCreditCentavos)}</dd></div><div><dt>Digital withholding VAT</dt><dd>{money(r.deductions.digitalVatCentavos)}</dd></div></dl>}<p className="preserve-lines">Provider payment: {r.providerPaymentId}</p></article>)}</details>
 </details>;
}
