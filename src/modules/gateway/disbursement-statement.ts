import {z} from 'zod';
import {digest} from '../cart/pricing';
import {DomainError} from '../partners/workflow';
import {centralPosition} from './central-position';

const id=z.uuid(),cents=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),environment=z.enum(['DEMO','MANUAL']);
const receipt=z.object({id,checkoutId:id,paymentId:z.string().max(160).regex(/^pay_[A-Za-z0-9]+$/),collectionId:id,requestId:id,quoteId:id,agencyId:id,mode:z.enum(['test','live']),grossCentavos:cents.positive(),feeCentavos:cents,netCentavos:cents,postingOutcome:z.literal('COLLECTED'),requiresReconciliation:z.literal(false)}).strict();
const entry=z.object({id,closeId:id,requestId:id,quoteId:id,agencyId:id,environment,recipient:z.enum(['COSIGNER','AGENCY','PLATFORM','MAINTENANCE']),beneficiaryActorId:z.string().min(1).max(160).nullable(),amountCentavos:cents}).strict();
export const disbursementStatementSource=z.object({
 requestId:id,agencyId:id,quoteId:id,closeId:id,environment,closedRevenueCentavos:cents,
 receipts:z.array(receipt).min(1).max(1000),entries:z.array(entry).min(1).max(1000),
 unresolvedGatewayCount:z.number().int().nonnegative(),refundReservationsCentavos:cents,
 refunds:z.array(z.object({id:z.string().regex(/^ref_[A-Za-z0-9]+$/),paymentId:z.string().regex(/^pay_[A-Za-z0-9]+$/),amountCentavos:cents.positive()}).strict()).max(1000).default([]),
 verifiedRefundedCentavos:cents,revenueCreditCount:z.number().int().nonnegative(),
}).strict();
export type DisbursementStatementSource=z.infer<typeof disbursementStatementSource>;
const denied=()=>new DomainError('Reconcile the exact central receipts, refunds and closed allocation sources before preparing this disbursement statement.',409);
function integer(n:bigint){if(n<0n||n>BigInt(Number.MAX_SAFE_INTEGER))throw denied();return Number(n);}
const order=(a:{id:string},b:{id:string})=>a.id<b.id?-1:a.id>b.id?1:0;

/** Build a review statement from server-loaded immutable facts. This is not a
 * bank settlement, approval, execution instruction or owner-fund release.
 * Adjusted/refunded sources intentionally fail closed until their separate
 * durable adjustment/recovery workflow supplies an accepted accounting basis. */
export function buildDisbursementStatement(input:unknown){
 const parsed=disbursementStatementSource.safeParse(input);if(!parsed.success)throw denied();const v=parsed.data;
 if(v.unresolvedGatewayCount||v.refundReservationsCentavos||v.revenueCreditCount)throw denied();
 const receipts=[...v.receipts].sort(order),entries=[...v.entries].sort(order),receiptIds=new Set<string>(),paymentIds=new Set<string>(),checkoutIds=new Set<string>(),collectionIds=new Set<string>(),entryIds=new Set<string>();
 let gross=0n,fees=0n,net=0n;
 for(const r of receipts){
  if(r.requestId!==v.requestId||r.agencyId!==v.agencyId||r.quoteId!==v.quoteId||(r.mode==='test'?'DEMO':'MANUAL')!==v.environment||receiptIds.has(r.id)||paymentIds.has(r.paymentId)||checkoutIds.has(r.checkoutId)||collectionIds.has(r.collectionId)||BigInt(r.feeCentavos)+BigInt(r.netCentavos)!==BigInt(r.grossCentavos))throw denied();
  receiptIds.add(r.id);paymentIds.add(r.paymentId);checkoutIds.add(r.checkoutId);collectionIds.add(r.collectionId);gross+=BigInt(r.grossCentavos);fees+=BigInt(r.feeCentavos);net+=BigInt(r.netCentavos);
 }
 const refundIds=new Set<string>();let refunded=0n;const refundByPayment=new Map<string,bigint>();
 for(const r of v.refunds){if(refundIds.has(r.id)||!paymentIds.has(r.paymentId))throw denied();refundIds.add(r.id);refunded+=BigInt(r.amountCentavos);refundByPayment.set(r.paymentId,(refundByPayment.get(r.paymentId)??0n)+BigInt(r.amountCentavos));}
 if(refunded!==BigInt(v.verifiedRefundedCentavos)||receipts.some(r=>(refundByPayment.get(r.paymentId)??0n)>BigInt(r.grossCentavos)))throw denied();
 const allocated={cosigner:0n,agency:0n,platform:0n,maintenance:0n};
 for(const e of entries){
  if(e.requestId!==v.requestId||e.agencyId!==v.agencyId||e.quoteId!==v.quoteId||e.closeId!==v.closeId||e.environment!==v.environment||entryIds.has(e.id)||(e.recipient==='COSIGNER'&&e.amountCentavos>0&&!e.beneficiaryActorId)||(e.recipient!=='COSIGNER'&&e.beneficiaryActorId!==null))throw denied();
  entryIds.add(e.id);allocated[e.recipient.toLowerCase() as keyof typeof allocated]+=BigInt(e.amountCentavos);
 }
 if(Object.values(allocated).reduce((s,n)=>s+n,0n)!==BigInt(v.closedRevenueCentavos)||gross-refunded!==BigInt(v.closedRevenueCentavos))throw denied();
 const position=centralPosition({collectedCentavos:integer(gross),refundedCentavos:integer(refunded),providerFeesCentavos:integer(fees),retainedDepositCentavos:0,allocations:{cosigner:integer(allocated.cosigner),agency:integer(allocated.agency),platform:integer(allocated.platform),maintenance:integer(allocated.maintenance)},agencyFundingCentavos:0,disbursedCentavos:0,financiallyClosed:true});
 // Attribute agency-borne fees to exact original agency entries with integer
 // largest remainders. Equal fractional shares use stable entry IDs, so reordered
 // queries cannot move a cent between sources or change the review digest.
 const feeFromAgency=fees<allocated.agency?fees:allocated.agency;
 const agencyEntries=entries.filter(e=>e.recipient==='AGENCY').map(e=>({id:e.id,fee:allocated.agency?BigInt(e.amountCentavos)*feeFromAgency/allocated.agency:0n,remainder:allocated.agency?BigInt(e.amountCentavos)*feeFromAgency%allocated.agency:0n}));
 const remainder=feeFromAgency-agencyEntries.reduce((s,e)=>s+e.fee,0n);
 agencyEntries.sort((a,b)=>a.remainder===b.remainder?order(a,b):a.remainder>b.remainder?-1:1);
 for(let n=0;n<agencyEntries.length;n++)if(BigInt(n)<remainder)agencyEntries[n].fee++;
 const feeByEntry=new Map(agencyEntries.map(e=>[e.id,e.fee]));
 const sources=entries.map(e=>({entryId:e.id,recipient:e.recipient,beneficiaryActorId:e.beneficiaryActorId,originalCentavos:e.amountCentavos,agencyFeeCentavos:integer(feeByEntry.get(e.id)??0n),proposedDisbursementCentavos:e.recipient==='PLATFORM'?0:integer(BigInt(e.amountCentavos)-(feeByEntry.get(e.id)??0n)),heldPlatformCentavos:e.recipient==='PLATFORM'?e.amountCentavos:0}));
 if(sources.reduce((s,e)=>s+BigInt(e.proposedDisbursementCentavos),0n)!==BigInt(position.combinedAgencyEntitlementCentavos)||sources.reduce((s,e)=>s+BigInt(e.agencyFeeCentavos),0n)!==feeFromAgency)throw denied();
 return {requestId:v.requestId,agencyId:v.agencyId,quoteId:v.quoteId,closeId:v.closeId,environment:v.environment,sourceDigest:digest({...v,receipts,entries,refunds:[...v.refunds].sort(order)}),verifiedGrossCentavos:integer(gross),providerFeesCentavos:integer(fees),providerNetReceiptsCentavos:integer(net),position,sources,canExecute:false as const,bankSettlementVerified:false as const,ownerFundsReleasedCentavos:0 as const};
}
