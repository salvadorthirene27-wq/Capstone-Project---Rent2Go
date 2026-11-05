import {it,expect} from "vitest";
import {cancellationCommand,canCancelStatus} from "../../src/modules/bookings/cancellation-schema";
const base={version:1,idempotencyKey:"f69119f8-b99f-4f34-a6b0-cf7df62f1554"};
it("requires exact reasoned cancellation actions and rejects invented refund authority",()=>{
 expect(cancellationCommand.safeParse({...base,action:"REQUEST_CANCELLATION",reason:"Changed travel plans"}).success).toBe(true);
 expect(cancellationCommand.safeParse({...base,action:"REQUEST_CANCELLATION",reason:" "}).success).toBe(false);
 expect(cancellationCommand.safeParse({...base,action:"REQUEST_CANCELLATION",reason:"Changed plans",refundCentavos:100}).success).toBe(false);
 expect(cancellationCommand.safeParse({...base,action:"REVIEW_CANCELLATION",cancellationId:base.idempotencyKey,digest:"a".repeat(64),decision:"APPROVE",reason:"Reviewed saved terms"}).success).toBe(true);
 expect(cancellationCommand.safeParse({...base,action:"REVIEW_CANCELLATION",cancellationId:base.idempotencyKey,digest:"wrong",decision:"APPROVE",reason:"Reason"}).success).toBe(false);
});
it("permits only pre-service request lifecycle stages without treating returned or financially closed services as cancellable",()=>{
 for(const s of ["REQUIREMENTS_PENDING","QUOTE_PENDING","AGREEMENT_SIGNED","PAYMENT_PARTIAL","READY_FOR_SERVICE","HOLD_EXPIRED"])expect(canCancelStatus(s)).toBe(true);
 for(const s of ["SERVICE_ACTIVE","FULFILLMENT_RECONCILIATION_PENDING","CANCELLED","CANCELLED_RECONCILIATION_PENDING","REJECTED","COMPLETED"])expect(canCancelStatus(s)).toBe(false);
});
