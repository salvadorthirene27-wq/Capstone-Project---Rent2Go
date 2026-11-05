import { expect, it } from "vitest";
import { agreementCommand, signatureCommand, agreementBody, agreementDigest, validateSignatureImage, validateSignerName, AGREEMENT_TEMPLATE_VERSION } from "../../src/modules/bookings/agreement-schema";
const id="e79318ab-a56e-4cc8-a8b0-a3e4676d7b36", digest="a".repeat(64);
it("requires exact ids/version and rejects client identities, prices and absent consent",()=>{
 expect(agreementCommand.safeParse({action:"ISSUE_AGREEMENT",version:1,quoteId:id,digest,amount:1}).success).toBe(false);
 expect(agreementCommand.safeParse({action:"WITHDRAW_AGREEMENT",version:1,agreementId:id,digest,reason:" "}).success).toBe(false);
 for(const consent of [undefined,false,"true"]) expect(signatureCommand.safeParse({version:1,agreementId:id,digest,signerName:"Test Renter",consent}).success).toBe(false);
 expect(signatureCommand.safeParse({version:1,agreementId:id,digest,signerName:"Test Renter",consent:true,actorId:id}).success).toBe(false);
});
it("matches typed names using Unicode, case and whitespace normalization without claiming authenticity",()=>{
 expect(()=>validateSignerName("  JOSE\u0301   RENTER ","José Renter")).not.toThrow();
 expect(()=>validateSignerName("Another Person","José Renter")).toThrow(/name/i);
});
it("accepts only bounded PNG/JPEG matching their declared magic bytes",()=>{
 const png=Buffer.from([137,80,78,71,13,10,26,10,0]);
 expect(validateSignatureImage(png,"image/png")).toBe("image/png");
 expect(validateSignatureImage(Buffer.from([255,216,255,0]),"image/jpeg")).toBe("image/jpeg");
 for(const [bytes,mime] of [[png,"image/jpeg"],[Buffer.from("%PDF-test"),"application/pdf"],[Buffer.alloc(1048577),"image/png"],[Buffer.alloc(0),"image/png"]] as const)expect(()=>validateSignatureImage(bytes,mime)).toThrow();
});
it("copies exact accepted customer clauses and totals and excludes private financial/consignment facts",()=>{
 const quote={lines:[{lineId:id,title:"Car",kind:"RENTAL",startAt:"2031-01-01T00:00:00Z",endAt:"2031-01-02T00:00:00Z",partySize:2,serviceCentavos:100,refundableDepositCentavos:200,driverName:null,shares:"private"}],totals:{serviceCentavos:100,refundableDepositCentavos:200,totalCentavos:300},policies:[{lineId:id,terms:"Accepted terms",cancellationPolicy:"Old accepted policy",refundPolicy:"Refund",damagePolicy:"Damage",latePolicy:"Late",agreementTerms:"PRIVATE"}]};
 const body=agreementBody("Saved agency","José Renter",quote);
 expect(body.services[0].serviceCentavos).toBe(100);expect(body.totals).toEqual(quote.totals);expect(body.policies[0].cancellationPolicy).toBe("Old accepted policy");
 expect(JSON.stringify(body)).not.toMatch(/private|PRIVATE|shares|agreementTerms/);
 expect(agreementDigest({id,templateVersion:AGREEMENT_TEMPLATE_VERSION,body})).not.toBe(agreementDigest({id,templateVersion:AGREEMENT_TEMPLATE_VERSION,body:{...body,renterName:"Other"}}));
});
