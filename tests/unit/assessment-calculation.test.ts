import {expect,it} from "vitest";
import {randomUUID} from "node:crypto";
import {digest} from "../../src/modules/cart/pricing";
import {calculateAssessmentProposal,reconcileAssessmentFunds} from "../../src/modules/bookings/assessment-calculation";
const lineId=randomUUID(),collectionId=randomUUID(),quoteId=randomUUID();
const line=(extra:object={})=>({lineId,title:"Rental including driver fee",context:"CONSIGNED" as const,delivered:true,serviceCentavos:14000,refundableDepositCentavos:20000,...extra});
const policy=(type="DAMAGE",context="CONSIGNED",shares={cosigner:7000,agency:1000,platform:1000,maintenance:1000})=>{
 const source={applicationId:randomUUID(),revision:3,policy:{type,context,explanation:"Explicit reviewed policy; each amount requires renter acceptance",shares}};
 return {...source,digest:digest(source)};
};
const charge=(extra:object={})=>({id:randomUUID(),lineId,amountCentavos:5000,reason:"Documented damage reviewed against saved return inspection",policy:policy(),...extra});
const credit=(amountCentavos=1000)=>({id:randomUUID(),lineId,amountCentavos,reason:"Agreed service credit"});
const source=(extra:object={})=>({id:collectionId,quoteId,environment:"DEMO" as const,amountCentavos:34000,...extra});
const refund=(stage:string,amountCentavos=1000,extra:object={})=>({id:randomUUID(),collectionId,amountCentavos,stage,...extra});
const funds=(extra:object={})=>({quoteId,environment:"DEMO" as const,obligationCentavos:14000,collections:[source()],refunds:[],pendingManualEvidenceCount:0,...extra});

it("includes the already-quoted driver fee in service revenue and excludes the refundable deposit",()=>{
 const p=calculateAssessmentProposal({lines:[line()],credits:[],charges:[]});
 expect(p).toMatchObject({quotedServiceCentavos:14000,quotedDepositCentavos:20000,deliveredServiceCentavos:14000,obligationCentavos:14000});
 expect(reconcileAssessmentFunds(funds())).toMatchObject({confirmedCentavos:34000,netHeldCentavos:34000,refundDueCentavos:20000,additionalBalanceCentavos:0,monetaryRequirementsSatisfied:false});
});
it("preserves line-specific credits and exact approved extra-charge allocation snapshots",()=>{
 const c=charge(),p=calculateAssessmentProposal({lines:[line()],credits:[credit()],charges:[c]});
 expect(p.obligationCentavos).toBe(18000);expect(p.serviceCreditCentavos).toBe(1000);expect(p.extraChargeCentavos).toBe(5000);
 expect(p.charges[0].policy).toEqual(c.policy);expect(p.lines[0].netServiceCentavos).toBe(13000);
});
it("starts cancelled/undelivered services at zero without inventing a retained cancellation penalty",()=>{
 const p=calculateAssessmentProposal({lines:[line({delivered:false})],credits:[],charges:[]});
 expect(p.obligationCentavos).toBe(0);expect(p.quotedServiceCentavos).toBe(14000);
 expect(reconcileAssessmentFunds(funds({obligationCentavos:p.obligationCentavos})).refundDueCentavos).toBe(34000);
});
it("requires a configured cancellation item for retained cancellation revenue",()=>{
 const p=calculateAssessmentProposal({lines:[line({delivered:false})],credits:[],charges:[charge({policy:policy("CANCELLATION")})]});
 expect(p.obligationCentavos).toBe(5000);
});
it.each(["FUEL","DAMAGE","LATE_RETURN","CLEANING"])("rejects %s against an undelivered service",type=>{
 expect(()=>calculateAssessmentProposal({lines:[line({delivered:false})],credits:[],charges:[charge({policy:policy(type)})]})).toThrow();
});
it("rejects cancellation fees on a delivered service and inapplicable ownership contexts",()=>{
 expect(()=>calculateAssessmentProposal({lines:[line()],credits:[],charges:[charge({policy:policy("CANCELLATION")})]})).toThrow();
 expect(()=>calculateAssessmentProposal({lines:[line({context:"AGENCY_OWNED"})],credits:[],charges:[charge()]})).toThrow();
});
it("cannot charge vehicle fuel or maintenance to a tour-only service",()=>{
 expect(()=>calculateAssessmentProposal({lines:[line({context:"TOUR_ONLY"})],credits:[],charges:[charge({policy:policy("FUEL","TOUR_ONLY",{cosigner:0,agency:9000,platform:1000,maintenance:0})})]})).toThrow();
});
it("rejects altered policy digests, missing percentages and unbalanced allocations",()=>{
 const p=policy();p.policy.shares.cosigner=6000;p.policy.shares.agency=2000;
 expect(()=>calculateAssessmentProposal({lines:[line()],credits:[],charges:[charge({policy:p})]})).toThrow("policy digest");
 expect(()=>calculateAssessmentProposal({lines:[line()],credits:[],charges:[charge({policy:policy("DAMAGE","CONSIGNED",{cosigner:6000,agency:1000,platform:1000,maintenance:1000})})]})).toThrow();
});
it("requires explicit shares and accepts a deliberately configured maintenance-only fuel allocation",()=>{
 const missing=policy();(missing.policy.shares as any).maintenance=null;
 expect(()=>calculateAssessmentProposal({lines:[line()],credits:[],charges:[charge({policy:missing})]})).toThrow();
 const p=calculateAssessmentProposal({lines:[line()],credits:[],charges:[charge({policy:policy("FUEL","CONSIGNED",{cosigner:0,agency:0,platform:0,maintenance:10000})})]});
 expect(p.charges[0].policy.policy.shares.maintenance).toBe(10000);
});
it("handles mixed delivered and cancelled lines without earning the cancelled service value",()=>{
 const tourId=randomUUID(),tour=line({lineId:tourId,context:"TOUR_ONLY",delivered:false,serviceCentavos:10000,refundableDepositCentavos:0});
 const p=calculateAssessmentProposal({lines:[line(),tour],credits:[credit()],charges:[charge({lineId:tourId,policy:policy("CANCELLATION","TOUR_ONLY",{cosigner:0,agency:9000,platform:1000,maintenance:0})})]});
 expect(p).toMatchObject({quotedServiceCentavos:24000,deliveredServiceCentavos:14000,serviceCreditCentavos:1000,extraChargeCentavos:5000,obligationCentavos:18000,quotedDepositCentavos:20000});
});
it("conserves confirmed funds across a matrix of payments, paid refunds and obligations",()=>{
 for(const confirmed of [1,100,10001,1_000_000])for(const paid of [0,Math.floor(confirmed/2),confirmed])for(const obligation of [0,1,5000,1_000_001]){
  const r=reconcileAssessmentFunds(funds({collections:[source({amountCentavos:confirmed})],refunds:paid?[refund("PAID",paid)]:[],obligationCentavos:obligation}));
  expect(r.netHeldCentavos+r.paidRefundCentavos).toBe(confirmed);
  expect(r.refundDueCentavos-r.additionalBalanceCentavos).toBe(r.netHeldCentavos-obligation);
  expect(r.additionalBalanceCentavos===0||r.refundDueCentavos===0).toBe(true);
 }
});
it("bounds cumulative credits by the same delivered line rather than borrowing another service's value",()=>{
 expect(()=>calculateAssessmentProposal({lines:[line(),line({lineId:randomUUID(),serviceCentavos:100000})],credits:[credit(8000),credit(8000)],charges:[]})).toThrow();
 expect(()=>calculateAssessmentProposal({lines:[line({delivered:false})],credits:[credit()],charges:[]})).toThrow();
});
it("rejects foreign line references and duplicate item/line identifiers",()=>{
 const c=charge();
 expect(()=>calculateAssessmentProposal({lines:[line()],credits:[],charges:[{...c,lineId:randomUUID()}]})).toThrow();
 expect(()=>calculateAssessmentProposal({lines:[line(),line()],credits:[],charges:[]})).toThrow();
 expect(()=>calculateAssessmentProposal({lines:[line()],credits:[],charges:[c,c]})).toThrow();
});
it("detects unsafe sums even when each individual centavo amount is a valid integer",()=>{
 expect(()=>calculateAssessmentProposal({lines:[line({serviceCentavos:Number.MAX_SAFE_INTEGER,refundableDepositCentavos:1})],credits:[],charges:[]})).toThrow();
 expect(()=>reconcileAssessmentFunds(funds({collections:[source({amountCentavos:Number.MAX_SAFE_INTEGER}),source({id:randomUUID(),amountCentavos:1})]}))).toThrow();
});
it.each([1.5,-1,Infinity,NaN,Number.MAX_SAFE_INTEGER+1])("rejects invalid money %s",amountCentavos=>{
 expect(()=>calculateAssessmentProposal({lines:[line()],credits:[],charges:[charge({amountCentavos})]})).toThrow();
});
it("counts executed refunds once and distinguishes approval reservation from actual payment",()=>{
 const r=reconcileAssessmentFunds(funds({refunds:[refund("PAID",5000),refund("APPROVED",10000)]}));
 expect(r).toMatchObject({paidRefundCentavos:5000,reservedRefundCentavos:10000,netHeldCentavos:29000,unreservedHeldCentavos:19000,refundDueCentavos:15000,unreservedRefundDueCentavos:5000});
});
it("includes pending demo refunds as reservations and exposes a resulting future shortage",()=>{
 expect(reconcileAssessmentFunds(funds({refunds:[refund("DEMO_PENDING",25000)]}))).toMatchObject({projectedBalanceAfterReservedRefundsCentavos:5000,additionalBalanceCentavos:0,overReservedCentavos:5000,monetaryRequirementsSatisfied:false});
});
it("handles an executed refund before assessment by showing the true additional balance",()=>{
 expect(reconcileAssessmentFunds(funds({refunds:[refund("PAID",25000)]}))).toMatchObject({netHeldCentavos:9000,additionalBalanceCentavos:5000,refundDueCentavos:0,monetaryRequirementsSatisfied:false});
});
it("does not reserve rejected, withdrawn or revoked proposals",()=>{
 const r=reconcileAssessmentFunds(funds({refunds:[refund("REJECTED"),refund("WITHDRAWN"),refund("REVOKED")]}));
 expect(r.reservedRefundCentavos).toBe(0);expect(r.paidRefundCentavos).toBe(0);
});
it("leaves manual evidence and pending review open even when amounts otherwise balance",()=>{
 expect(reconcileAssessmentFunds(funds({obligationCentavos:34000,pendingManualEvidenceCount:1})).monetaryRequirementsSatisfied).toBe(false);
 expect(reconcileAssessmentFunds(funds({obligationCentavos:34000,refunds:[refund("PENDING_REVIEW")]})).monetaryRequirementsSatisfied).toBe(false);
 expect(reconcileAssessmentFunds(funds({obligationCentavos:34000})).monetaryRequirementsSatisfied).toBe(true);
});
it("keeps manual and demo funds separate and rejects refunds without the exact original source",()=>{
 expect(()=>reconcileAssessmentFunds(funds({collections:[source({environment:"MANUAL"})]}))).toThrow();
 expect(()=>reconcileAssessmentFunds(funds({collections:[source({quoteId:randomUUID()})]}))).toThrow();
 expect(()=>reconcileAssessmentFunds(funds({refunds:[refund("PAID",1000,{collectionId:randomUUID()})]}))).toThrow();
});
it("rejects duplicate collections/refunds and over-reservation of a single collection",()=>{
 const r=refund("PAID");
 expect(()=>reconcileAssessmentFunds(funds({collections:[source(),source()]}))).toThrow();
 expect(()=>reconcileAssessmentFunds(funds({refunds:[r,r]}))).toThrow();
 expect(()=>reconcileAssessmentFunds(funds({refunds:[refund("PAID",20000),refund("APPROVED",15000)]}))).toThrow();
});
it("does not use spare capacity from another collection to cover an invalid source refund",()=>{
 expect(()=>reconcileAssessmentFunds(funds({collections:[source({amountCentavos:1000}),source({id:randomUUID(),amountCentavos:100000})],refunds:[refund("PAID",2000)]}))).toThrow();
});
