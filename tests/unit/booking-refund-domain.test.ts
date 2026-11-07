import {it,expect} from "vitest";
import {refundCommand,refundCapacity,refundStage,refundListQuery} from "../../src/modules/bookings/refund-schema";
const id="7d875fbe-97cf-4b0b-afd1-e41503b7333a",base={version:1,idempotencyKey:id};
it("strictly separates request, review and paid execution without client-selected amount or environment at payout",()=>{
 expect(refundCommand.safeParse({...base,action:"REQUEST_REFUND",collectionId:id,amountCentavos:1000,reason:"Cancelled service"}).success).toBe(true);
 expect(refundCommand.safeParse({...base,action:"REQUEST_REFUND",collectionId:id,amountCentavos:0,reason:"Cancelled service"}).success).toBe(false);
 expect(refundCommand.safeParse({...base,action:"REVIEW_REFUND",refundId:id,digest:"a".repeat(64),decision:"APPROVE",reason:"Reviewed saved policy",amountCentavos:999}).success).toBe(false);
 expect(refundCommand.safeParse({...base,action:"SIMULATE_REFUND",refundId:id,digest:"a".repeat(64),outcome:"APPROVED",environment:"MANUAL"}).success).toBe(false);
});
it("keeps reservations and paid refunds separate while bounding both by original collections using exact integer centavos",()=>{
 expect(refundCapacity(10000,3000,2000)).toEqual({confirmedCentavos:10000,reservedCentavos:3000,paidCentavos:2000,availableCentavos:5000});
 expect(()=>refundCapacity(10000,6000,5000)).toThrow();expect(()=>refundCapacity(Number.MAX_SAFE_INTEGER+1,0,0)).toThrow();expect(()=>refundCapacity(10000,-1,0)).toThrow();
});
it("does not call an approved or pending simulation paid and validates separate history/source pages",()=>{
 expect(refundStage(null,null,false,false)).toBe("PENDING_REVIEW");expect(refundStage("APPROVE",null,false,false)).toBe("APPROVED");expect(refundStage("APPROVE",null,false,true)).toBe("DEMO_PENDING");expect(refundStage("APPROVE",null,true,false)).toBe("PAID");expect(refundStage("APPROVE","REVOKE",false,false)).toBe("REVOKED");
 expect(refundListQuery.parse({})).toEqual({creditPage:1,sourcePage:1,historyPage:1});expect(refundListQuery.safeParse({sourcePage:0}).success).toBe(false);
});
