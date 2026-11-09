import {createHash} from 'node:crypto';
import {z} from 'zod';
import {DomainError} from '../partners/workflow';
import type {PayMongoConfig,PayMongoMode} from './paymongo';

export const providerRefundId=z.string().max(160).regex(/^ref_[A-Za-z0-9]+$/);
const paymentId=z.string().max(160).regex(/^pay_[A-Za-z0-9]+$/);
const mode=z.enum(['test','live']);
const amount=z.number().int().min(100).max(2147483647);
const stamp=z.number().int().min(1).max(253402300799);
const status=z.enum(['pending','processing','succeeded','failed']);
const reference=z.uuid();
const fingerprint=z.string().regex(/^[a-f0-9]{64}$/);
const cents=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const normalized=z.object({id:providerRefundId,paymentId,mode,amountCentavos:amount,currency:z.literal('PHP'),status,createdAt:stamp,updatedAt:stamp,reference:reference.nullable()}).strict();
export type ProviderRefund=z.infer<typeof normalized>;
const resource=z.object({id:providerRefundId,type:z.literal('refund'),attributes:z.object({
 amount,currency:z.literal('PHP'),livemode:z.boolean(),payment_id:paymentId,status,created_at:stamp,updated_at:stamp,
 metadata:z.object({rent2go_refund:reference.optional()}).default({}),
})});
const invalid=()=>new DomainError('The provider refund record requires independent reconciliation.',503);
const mismatch=()=>new DomainError('The refund does not match its original payment and approved source. Independent reconciliation is required.',409);

/** Parse a server-retrieved resource. Notes, billing, arbitrary metadata and
 * payout details are deliberately excluded from the application projection. */
export function parseRefundResource(input:unknown,expectedMode:PayMongoMode):ProviderRefund{
 const result=resource.safeParse(input);if(!result.success)throw invalid();
 const {id,attributes:a}=result.data;
 if(a.livemode!==(expectedMode==='live')||a.updated_at<a.created_at)throw invalid();
 return {id,paymentId:a.payment_id,mode:expectedMode,amountCentavos:a.amount,currency:a.currency,status:a.status,createdAt:a.created_at,updatedAt:a.updated_at,reference:a.metadata.rent2go_refund??null};
}

const intent=z.object({id:reference,paymentId,mode,merchantFingerprint:fingerprint,amountCentavos:amount,originalPaymentCentavos:cents.positive(),providerRefundId:providerRefundId.nullable()}).strict();
export type SavedProviderRefundIntent=z.infer<typeof intent>;
/** The intent and original gross must be loaded from durable server-owned
 * records. This helper never accepts a browser return URL as payment evidence. */
export function matchRefundResource(saved:unknown,input:unknown,config:Pick<PayMongoConfig,'mode'|'secretKey'>):ProviderRefund{
 const stored=intent.safeParse(saved),observed=normalized.safeParse(input);
 if(!stored.success||!observed.success)throw mismatch();
 const s=stored.data,r=observed.data;
 if(r.updatedAt<r.createdAt||s.mode!==config.mode||r.mode!==s.mode||createHash('sha256').update(config.secretKey).digest('hex')!==s.merchantFingerprint||r.reference!==s.id||r.paymentId!==s.paymentId||r.amountCentavos!==s.amountCentavos||s.amountCentavos>s.originalPaymentCentavos||(s.providerRefundId!==null&&r.id!==s.providerRefundId))throw mismatch();
 return r;
}

/** Observations can advance a verified refund, never rewrite its identity or
 * reverse a terminal outcome. Older evidence cannot undo a later observation. */
export function advanceRefundObservation(previous:ProviderRefund|null,input:unknown){
 const next=normalized.safeParse(input);if(!next.success||next.data.updatedAt<next.data.createdAt)throw mismatch();
 const n=next.data;if(!previous)return {refund:n,changed:true,stale:false};
 const prior=normalized.safeParse(previous);if(!prior.success)throw mismatch();const p=prior.data;
 if(p.updatedAt<p.createdAt||p.id!==n.id||p.paymentId!==n.paymentId||p.mode!==n.mode||p.amountCentavos!==n.amountCentavos||p.currency!==n.currency||p.reference!==n.reference||p.createdAt!==n.createdAt)throw mismatch();
 const terminal=p.status==='succeeded'||p.status==='failed';
 if(terminal&&n.status!==p.status){
  if(n.updatedAt<p.updatedAt&&(n.status==='pending'||n.status==='processing'))return {refund:p,changed:false,stale:true};
  throw mismatch();
 }
 if(n.updatedAt<p.updatedAt)return {refund:p,changed:false,stale:true};
 if(p.status==='processing'&&n.status==='pending')throw mismatch();
 return {refund:n,changed:p.status!==n.status||p.updatedAt!==n.updatedAt,stale:false};
}

const reservation=z.object({id:reference,paymentId,mode,merchantFingerprint:fingerprint,amountCentavos:amount,providerRefundId:providerRefundId.nullable(),status:z.enum(['PREPARED','DISPATCHING','UNKNOWN','PENDING','PROCESSING','SUCCEEDED','FAILED','CANCELLED_BEFORE_DISPATCH'])}).strict();
const budget=z.object({paymentId,mode,merchantFingerprint:fingerprint,grossCentavos:cents.positive(),refunds:z.array(reservation).max(1000)}).strict();
/** Reserve uncertain and in-flight intents against the ORIGINAL payment, not
 * its net-of-fee amount. Failed or proven never-dispatched cancellations release
 * only their own reservation. Actual provider fees are never reversed here. */
export function providerRefundBudget(input:unknown){
 const parsed=budget.safeParse(input);if(!parsed.success)throw mismatch();const v=parsed.data;
 const ids=new Set<string>(),providerIds=new Set<string>();let refunded=0n,reserved=0n;
 for(const r of v.refunds){
  if(r.paymentId!==v.paymentId||r.mode!==v.mode||r.merchantFingerprint!==v.merchantFingerprint||ids.has(r.id)||(r.providerRefundId!==null&&providerIds.has(r.providerRefundId))||(r.status==='SUCCEEDED'&&r.providerRefundId===null)||(r.status==='CANCELLED_BEFORE_DISPATCH'&&r.providerRefundId!==null))throw mismatch();
  ids.add(r.id);if(r.providerRefundId)providerIds.add(r.providerRefundId);
  if(r.status==='SUCCEEDED')refunded+=BigInt(r.amountCentavos);
  else if(r.status!=='FAILED'&&r.status!=='CANCELLED_BEFORE_DISPATCH')reserved+=BigInt(r.amountCentavos);
 }
 const gross=BigInt(v.grossCentavos);if(refunded+reserved>gross)throw mismatch();
 return {originalGrossCentavos:v.grossCentavos,verifiedRefundedCentavos:Number(refunded),reservedCentavos:Number(reserved),availableForRefundCentavos:Number(gross-refunded-reserved),hasUnresolved:reserved>0n};
}
