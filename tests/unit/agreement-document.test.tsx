import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect,it } from "vitest";
import { AgreementDocument, type AgreementBody } from "../../src/components/agreement-document";
it("prints exact service, deposit, policy and private signature record without rendering supplied HTML",()=>{
 const body:AgreementBody={agencyName:"Synthetic agency",renterName:"Synthetic renter",services:[{lineId:"line",title:"<script>unsafe</script>",kind:"RENTAL",startAt:"2031-01-02T00:00:00Z",endAt:"2031-01-03T00:00:00Z",partySize:2,serviceCentavos:350000,refundableDepositCentavos:500000,driverName:null}],totals:{serviceCentavos:350000,refundableDepositCentavos:500000,totalCentavos:850000},policies:[{lineId:"line",terms:"Exact saved terms",cancellationPolicy:"Cancellation clause",refundPolicy:"Refund clause",damagePolicy:"Deposit clause",latePolicy:"Late clause"}],acknowledgement:"Exact consent text"};
 const html=renderToStaticMarkup(<AgreementDocument revision={2} issuedAt="2031-01-01T00:00:00Z" expiresAt="2031-01-02T00:00:00Z" body={body} signature={{id:"signature-id",signerName:"Synthetic renter",signedAt:"2031-01-01T01:00:00Z"}}/>);
 for(const text of ["Synthetic agency","Synthetic renter","Exact saved terms","Refund clause","Deposit clause","Exact consent text","₱5,000.00","₱8,500.00","/api/booking-signatures/signature-id"])expect(html).toContain(text);
 expect(html).toContain("&lt;script&gt;unsafe&lt;/script&gt;");expect(html).not.toContain("<script>");
});
