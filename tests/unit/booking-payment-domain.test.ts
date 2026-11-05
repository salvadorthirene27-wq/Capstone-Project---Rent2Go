import { expect,it } from "vitest";
import { paymentCommand,evidenceCommand,normalizePaymentReference,paymentTotals,validatePaymentEvidence } from "../../src/modules/bookings/payment-schema";
const id="e79318ab-a56e-4cc8-a8b0-a3e4676d7b36",base={version:1,idempotencyKey:id,agreementId:id,digest:"a".repeat(64)};
it("accepts exact fixed payment commands and rejects prices, actors and unsafe amounts",()=>{
 expect(paymentCommand.safeParse({...base,action:"RECORD_CASH",amountCentavos:101,reference:" Cash 1 ",note:"Received at desk"}).success).toBe(true);
 for(const amountCentavos of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1])expect(paymentCommand.safeParse({...base,action:"RECORD_CASH",amountCentavos,reference:"X",note:"Received"}).success).toBe(false);
 const demo={...base,action:"SIMULATE_PAYMENT",method:"DEMO_CARD",outcome:"APPROVED"};
 expect(paymentCommand.safeParse(demo).success).toBe(true);expect(paymentCommand.safeParse({...demo,amountCentavos:1}).success).toBe(false);
 expect(evidenceCommand.safeParse({...base,amountCentavos:1,reference:"X",actorId:id}).success).toBe(false);
 expect(evidenceCommand.safeParse({...base,amountCentavos:1,reference:"ß".repeat(160)}).success).toBe(false);
 expect(paymentCommand.safeParse({version:1,idempotencyKey:id,action:"REVIEW_GCASH",attemptId:id,decision:"REJECT",reason:" "}).success).toBe(false);
});
it("normalizes confirmed references and separates quoted services, deposits, balance and overpayment",()=>{
 expect(normalizePaymentReference(" ＡbC   123 ")).toBe("ABC 123");
 expect(paymentTotals({serviceCentavos:100,refundableDepositCentavos:200,totalCentavos:300},100)).toEqual({serviceCentavos:100,refundableDepositCentavos:200,totalCentavos:300,confirmedCentavos:100,balanceCentavos:200,creditCentavos:0});
 expect(paymentTotals({serviceCentavos:100,refundableDepositCentavos:200,totalCentavos:300},350)).toMatchObject({balanceCentavos:0,creditCentavos:50});
 expect(()=>paymentTotals({serviceCentavos:100,refundableDepositCentavos:200,totalCentavos:301},0)).toThrow();
 expect(()=>paymentTotals({serviceCentavos:100,refundableDepositCentavos:200,totalCentavos:300},Number.MAX_SAFE_INTEGER+1)).toThrow();
});
it("accepts bounded matching PNG/JPEG/PDF evidence and rejects disguised files",()=>{
 const png=Buffer.from([137,80,78,71,13,10,26,10,0]);expect(validatePaymentEvidence(png,"image/png")).toBe("image/png");
 expect(validatePaymentEvidence(Buffer.from("%PDF-1.7"),"application/pdf")).toBe("application/pdf");
 expect(validatePaymentEvidence(Buffer.from([255,216,255,0]),"image/jpeg")).toBe("image/jpeg");
 for(const [bytes,mime] of [[png,"application/pdf"],[Buffer.from("fake"),"image/png"],[Buffer.alloc(5*1024*1024+1),"image/png"],[Buffer.alloc(0),"image/png"]] as const)expect(()=>validatePaymentEvidence(bytes,mime)).toThrow();
});
