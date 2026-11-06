import {date,money,methodLabels} from "@/modules/partners/presentation";

export type PaymentReceipt={
 id:string;environment:"MANUAL"|"DEMO";method:string;reference:string;amountCentavos:number;
 recordedAt:string;receiverName:string;agencyName:string;renterName:string;quoteId:string;agreementId:string;
 serviceCentavos:number;refundableDepositCentavos:number;totalCentavos:number;
 settlement?:{id:string;revision:number;obligationCentavos:number;extraCentavos:number}|null;
};
export function PaymentReceiptDocument({receipt:r}:{receipt:PaymentReceipt}){
 return <article className="agreement-document payment-receipt-document">
  <p className="notice"><strong>{r.environment==="DEMO"?"Simulated payment · no charge":"Agency collection record"}</strong></p>
  <header>
   <p><strong>{r.agencyName}</strong><br/>Renter: {r.renterName}</p>
   <p>Recorded {date(r.recordedAt)} (Philippine time)<br/>Recorded by: {r.receiverName}</p>
  </header>
  {r.settlement&&<p><strong>Additional-balance collection · settlement version {r.settlement.revision}</strong><br/>Accepted service and charge obligation: {money(r.settlement.obligationCentavos)} · accepted extra charges: {money(r.settlement.extraCentavos)}</p>}
  <h2>This collection</h2>
  <dl className="agreement-totals">
   <div><dt>Amount recorded</dt><dd>{money(r.amountCentavos)}</dd></div>
   <div><dt>Method</dt><dd>{methodLabels[r.method as keyof typeof methodLabels]??r.method}</dd></div>
   <div><dt>Reference</dt><dd>{r.reference}</dd></div>
  </dl>
  <h2>{r.settlement?"Original quotation for reference":"Quoted amounts"}</h2>
  <dl className="agreement-totals">
   <div><dt>Service charges</dt><dd>{money(r.serviceCentavos)}</dd></div>
   <div><dt>Refundable deposits</dt><dd>{money(r.refundableDepositCentavos)}</dd></div>
   <div><dt>Quoted total</dt><dd>{money(r.totalCentavos)}</dd></div>
  </dl>
  <p>This collection does not by itself confirm the full balance or authorize service release. Check the booking request for current payment and fulfillment status. Refundable deposits remain separate until return reconciliation.</p>
  <p>Collection: {r.id}<br/>Quotation: {r.quoteId}<br/>Signed agreement: {r.agreementId}</p>
 </article>;
}
