import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {it,expect} from "vitest";
import {PaymentReceiptDocument,type PaymentReceipt} from "../../src/components/payment-receipt-document";
const receipt:PaymentReceipt={id:"collection-id",environment:"DEMO",method:"DEMO_CARD",reference:"SYNTHETIC-DEMO-REF",amountCentavos:400000,recordedAt:"2032-01-01T00:00:00Z",receiverName:"Synthetic operator",agencyName:"Synthetic agency",renterName:"<script>unsafe</script>",quoteId:"saved-quote",agreementId:"saved-agreement",serviceCentavos:350000,refundableDepositCentavos:500000,totalCentavos:850000};
it("distinguishes this demo collection from quoted service/deposit amounts and escapes supplied text",()=>{
 const html=renderToStaticMarkup(<PaymentReceiptDocument receipt={receipt}/>);
 for(const text of ["Simulated payment · no charge","₱4,000.00","₱3,500.00","₱5,000.00","₱8,500.00","SYNTHETIC-DEMO-REF","saved-quote","saved-agreement"])expect(html).toContain(text);
 expect(html).toContain("&lt;script&gt;unsafe&lt;/script&gt;");expect(html).not.toContain("<script>");expect(html).not.toMatch(/booking confirmed|service released/i);
});
it("labels manual confirmation as an agency record without implying provider settlement or full payment",()=>{
 const html=renderToStaticMarkup(<PaymentReceiptDocument receipt={{...receipt,environment:"MANUAL",method:"GCASH"}}/>);
 expect(html).toContain("Agency collection record");expect(html).not.toContain("Simulated payment · no charge");expect(html).toContain("This collection does not by itself confirm the full balance");expect(html).toContain("Refundable deposits remain separate");
});
