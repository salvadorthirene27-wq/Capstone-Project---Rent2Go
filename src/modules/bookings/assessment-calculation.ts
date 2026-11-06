import {z} from "zod";
import {uuid,versionSchema} from "../../lib/http";
import {digest} from "../cart/pricing";
import {completeExtraChargePolicy,extraChargeContexts} from "../partners/extra-charges";
import {DomainError} from "../partners/workflow";

const cents=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positiveCents=cents.refine(n=>n>0,"Enter a positive whole-centavo amount.");
const reason=z.string().trim().min(1).max(2000);
const completePolicy=completeExtraChargePolicy.transform(p=>({...p,shares:{cosigner:p.shares.cosigner!,agency:p.shares.agency!,platform:p.shares.platform!,maintenance:p.shares.maintenance!}}));
const policySnapshot=z.object({applicationId:uuid,revision:versionSchema,policy:completePolicy,digest:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const lineSchema=z.object({lineId:uuid,title:z.string().trim().min(1).max(300),context:z.enum(extraChargeContexts),delivered:z.boolean(),serviceCentavos:cents,refundableDepositCentavos:cents}).strict();
const creditSchema=z.object({id:uuid,lineId:uuid,amountCentavos:positiveCents,reason}).strict();
const chargeSchema=creditSchema.extend({policy:policySnapshot}).strict();
const proposalSchema=z.object({lines:z.array(lineSchema).min(1).max(20),credits:z.array(creditSchema).max(40),charges:z.array(chargeSchema).max(40)}).strict();

function safe(value:bigint){
  if(value<0n||value>BigInt(Number.MAX_SAFE_INTEGER))throw new DomainError("Financial totals exceed the supported whole-centavo range.",409);
  return Number(value);
}
const sum=(values:number[])=>safe(values.reduce((n,v)=>n+BigInt(v),0n));
function unique(values:string[],label:string){if(new Set(values).size!==values.length)throw new DomainError(`Duplicate ${label} requires financial review.`,409);}

/**
 * Pure calculation over server-resolved facts. The caller must authorize the booking,
 * read its immutable quotation/physical events and resolve each approved agency policy.
 * A valid digest checks snapshot integrity; it does not prove agency approval or consent.
 * This function creates no charge, deposit deduction, payment, ledger or completion.
 */
export function calculateAssessmentProposal(input:unknown){
  const p=proposalSchema.parse(input);
  unique(p.lines.map(l=>l.lineId),"service line");
  unique([...p.credits,...p.charges].map(i=>i.id),"assessment item");
  const byId=new Map(p.lines.map(l=>[l.lineId,l]));
  for(const item of [...p.credits,...p.charges])if(!byId.has(item.lineId))throw new DomainError("An assessment item references another service.",409);
  for(const charge of p.charges){
    const line=byId.get(charge.lineId)!,{digest:hash,...source}=charge.policy;
    if(digest(source)!==hash)throw new DomainError("The saved extra-charge policy digest does not match its contents.",409);
    if(source.policy.context!==line.context)throw new DomainError("The extra-charge allocation does not match the service's ownership context.",409);
    if(line.delivered?(source.policy.type==="CANCELLATION"):(source.policy.type!=="CANCELLATION"))throw new DomainError("The extra-charge type does not match delivery or cancellation of this service.",409);
  }
  const lines=p.lines.map(line=>{
    const deliveredServiceCentavos=line.delivered?line.serviceCentavos:0;
    const serviceCreditCentavos=sum(p.credits.filter(i=>i.lineId===line.lineId).map(i=>i.amountCentavos));
    if(serviceCreditCentavos>deliveredServiceCentavos)throw new DomainError("Service credits exceed the delivered value of this exact service.",409);
    const extraChargeCentavos=sum(p.charges.filter(i=>i.lineId===line.lineId).map(i=>i.amountCentavos));
    const netServiceCentavos=deliveredServiceCentavos-serviceCreditCentavos;
    return {...line,deliveredServiceCentavos,serviceCreditCentavos,netServiceCentavos,extraChargeCentavos,obligationCentavos:sum([netServiceCentavos,extraChargeCentavos])};
  });
  const quotedServiceCentavos=sum(lines.map(l=>l.serviceCentavos)),quotedDepositCentavos=sum(lines.map(l=>l.refundableDepositCentavos));
  sum([quotedServiceCentavos,quotedDepositCentavos]);
  return {
    lines,credits:p.credits,charges:p.charges,quotedServiceCentavos,quotedDepositCentavos,
    deliveredServiceCentavos:sum(lines.map(l=>l.deliveredServiceCentavos)),
    serviceCreditCentavos:sum(lines.map(l=>l.serviceCreditCentavos)),
    extraChargeCentavos:sum(lines.map(l=>l.extraChargeCentavos)),
    obligationCentavos:sum(lines.map(l=>l.obligationCentavos)),
  };
}

const environment=z.enum(["MANUAL","DEMO"]);
const collectionSchema=z.object({id:uuid,quoteId:uuid,environment,amountCentavos:positiveCents}).strict();
const refundSchema=z.object({id:uuid,collectionId:uuid,amountCentavos:positiveCents,stage:z.enum(["PENDING_REVIEW","APPROVED","DEMO_PENDING","PAID","REJECTED","WITHDRAWN","REVOKED"])}).strict();
const fundsSchema=z.object({quoteId:uuid,environment,obligationCentavos:cents,collections:z.array(collectionSchema).max(10000),refunds:z.array(refundSchema).max(10000),pendingManualEvidenceCount:z.number().int().min(0).max(10000)}).strict();

/** Monetary reconciliation only: true does not authorize financial completion. */
export function reconcileAssessmentFunds(input:unknown){
  const p=fundsSchema.parse(input);
  unique(p.collections.map(c=>c.id),"collection");unique(p.refunds.map(r=>r.id),"refund");
  const sources=new Map(p.collections.map(c=>[c.id,c]));
  for(const c of p.collections)if(c.environment!==p.environment||c.quoteId!==p.quoteId)throw new DomainError("Manual/demo funds or different quotation accounts cannot be combined.",409);
  const refundsBySource=new Map<string,typeof p.refunds>();
  for(const r of p.refunds){
    if(!sources.has(r.collectionId))throw new DomainError("A refund has no matching original collection.",409);
    const list=refundsBySource.get(r.collectionId)??[];list.push(r);refundsBySource.set(r.collectionId,list);
  }
  let pendingRefundReviewCount=0;
  const sourceBalances=p.collections.map(c=>{
    const refunds=refundsBySource.get(c.id)??[];
    const paidRefundCentavos=sum(refunds.filter(r=>r.stage==="PAID").map(r=>r.amountCentavos));
    const reservedRefundCentavos=sum(refunds.filter(r=>r.stage==="APPROVED"||r.stage==="DEMO_PENDING").map(r=>r.amountCentavos));
    if(BigInt(paidRefundCentavos)+BigInt(reservedRefundCentavos)>BigInt(c.amountCentavos))throw new DomainError("Refunds exceed their exact original collection's capacity.",409);
    pendingRefundReviewCount+=refunds.filter(r=>r.stage==="PENDING_REVIEW").length;
    return {collectionId:c.id,confirmedCentavos:c.amountCentavos,paidRefundCentavos,reservedRefundCentavos,unreservedCentavos:c.amountCentavos-paidRefundCentavos-reservedRefundCentavos};
  });
  const confirmedCentavos=sum(sourceBalances.map(c=>c.confirmedCentavos));
  const paidRefundCentavos=sum(sourceBalances.map(c=>c.paidRefundCentavos));
  const reservedRefundCentavos=sum(sourceBalances.map(c=>c.reservedRefundCentavos));
  const netHeldCentavos=confirmedCentavos-paidRefundCentavos;
  const unreservedHeldCentavos=netHeldCentavos-reservedRefundCentavos;
  const refundDueCentavos=Math.max(netHeldCentavos-p.obligationCentavos,0);
  const additionalBalanceCentavos=Math.max(p.obligationCentavos-netHeldCentavos,0);
  return {
    quoteId:p.quoteId,environment:p.environment,obligationCentavos:p.obligationCentavos,
    sources:sourceBalances,confirmedCentavos,paidRefundCentavos,reservedRefundCentavos,netHeldCentavos,unreservedHeldCentavos,
    refundDueCentavos,unreservedRefundDueCentavos:Math.max(refundDueCentavos-reservedRefundCentavos,0),
    additionalBalanceCentavos,projectedBalanceAfterReservedRefundsCentavos:Math.max(p.obligationCentavos-unreservedHeldCentavos,0),
    overReservedCentavos:Math.max(reservedRefundCentavos-refundDueCentavos,0),
    pendingManualEvidenceCount:p.pendingManualEvidenceCount,pendingRefundReviewCount,
    monetaryRequirementsSatisfied:additionalBalanceCentavos===0&&refundDueCentavos===0&&reservedRefundCentavos===0&&p.pendingManualEvidenceCount===0&&pendingRefundReviewCount===0,
  };
}
