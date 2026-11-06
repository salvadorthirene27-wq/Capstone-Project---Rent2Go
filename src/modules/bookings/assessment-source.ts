import type {PoolClient} from "pg";
import {digest} from "../cart/pricing";
import {DomainError} from "../partners/workflow";
import {calculateAssessmentProposal,reconcileAssessmentFunds} from "./assessment-calculation";

export async function assessmentFunds(c:PoolClient,requestId:string,quoteId:string,environment:"MANUAL"|"DEMO",obligationCentavos:number){
 const collections=(await c.query("SELECT id,quote_id AS \"quoteId\",environment,amount_centavos FROM booking_payment_collection WHERE request_id=$1 AND quote_id=$2 ORDER BY id LIMIT 10001",[requestId,quoteId])).rows.map(r=>({id:r.id as string,quoteId:r.quoteId as string,environment:r.environment as "MANUAL"|"DEMO",amountCentavos:Number(r.amount_centavos)}));
 const refunds=(await c.query(`SELECT r.id,r.collection_id,r.amount_centavos,CASE WHEN p.id IS NOT NULL THEN 'PAID' WHEN x.action='WITHDRAW' THEN 'WITHDRAWN' WHEN x.action='REVOKE' THEN 'REVOKED' WHEN d.decision='REJECT' THEN 'REJECTED' WHEN d.decision='APPROVE' THEN CASE WHEN EXISTS(SELECT 1 FROM booking_refund_attempt a WHERE a.refund_id=r.id AND a.initial_outcome='PENDING' AND NOT EXISTS(SELECT 1 FROM booking_refund_resolution z WHERE z.attempt_id=a.id)) THEN 'DEMO_PENDING' ELSE 'APPROVED' END ELSE 'PENDING_REVIEW' END AS stage FROM booking_refund_request r LEFT JOIN booking_refund_decision d ON d.refund_id=r.id LEFT JOIN booking_refund_cancel x ON x.refund_id=r.id LEFT JOIN booking_refund_payment p ON p.refund_id=r.id WHERE r.request_id=$1 AND r.quote_id=$2 ORDER BY r.id LIMIT 10001`,[requestId,quoteId])).rows.map(r=>({id:r.id as string,collectionId:r.collection_id as string,amountCentavos:Number(r.amount_centavos),stage:r.stage as string}));
 const pending=Number((await c.query("SELECT count(*) n FROM booking_payment_attempt a JOIN booking_payment_account p ON p.id=a.account_id WHERE a.request_id=$1 AND p.environment='MANUAL' AND a.initial_outcome='SUBMITTED' AND NOT EXISTS(SELECT 1 FROM booking_payment_decision d WHERE d.attempt_id=a.id)",[requestId])).rows[0].n);
 const facts={quoteId,environment,collections,refunds,pendingManualEvidenceCount:pending};
 return {facts,totals:reconcileAssessmentFunds({...facts,obligationCentavos})};
}
export async function assessmentSource(c:PoolClient,r:{id:string;status:string}){
 const q=(await c.query("SELECT id,digest,public_snapshot FROM booking_quotation WHERE request_id=$1 ORDER BY revision DESC LIMIT 1",[r.id])).rows[0];
 if(!q)return null;
 const account=(await c.query("SELECT environment FROM booking_payment_account WHERE quote_id=$1",[q.id])).rows[0];if(!account)return null;
 const saved=(await c.query("SELECT line_id,public_snapshot,private_financial_snapshot->>'category' AS context FROM booking_quotation_line WHERE quote_id=$1 ORDER BY line_id",[q.id])).rows;
 if(saved.some(l=>!['CONSIGNED','AGENCY_OWNED','TOUR_ONLY'].includes(l.context)))throw new DomainError("Saved ownership terms need financial review before assessment.",409);
 const events=(await c.query("SELECT id,line_id,action FROM booking_fulfillment_event WHERE quote_id=$1 ORDER BY id",[q.id])).rows;
 const conditions=(await c.query("SELECT DISTINCT ON (i.line_id) i.line_id,i.id,i.digest,a.decision FROM booking_inspection i LEFT JOIN booking_inspection_ack a ON a.inspection_id=i.id WHERE i.quote_id=$1 AND i.phase='POST' ORDER BY i.line_id,i.revision DESC",[q.id])).rows;
 const lines=saved.map(l=>({lineId:l.line_id as string,title:l.public_snapshot.title as string,context:l.context as "CONSIGNED"|"AGENCY_OWNED"|"TOUR_ONLY",delivered:events.some(e=>e.line_id===l.line_id&&['RECORD_RETURN','COMPLETE_TOUR'].includes(e.action)),serviceCentavos:l.public_snapshot.serviceCentavos as number,refundableDepositCentavos:l.public_snapshot.refundableDepositCentavos as number}));
 const base=calculateAssessmentProposal({lines,credits:[],charges:[]}),funds=await assessmentFunds(c,r.id,q.id,account.environment,base.obligationCentavos);
 let blockedReason:string|null=null;
 if(!['FULFILLMENT_RECONCILIATION_PENDING','CANCELLED_RECONCILIATION_PENDING','PAYMENT_RECONCILIATION_REQUIRED'].includes(r.status))blockedReason="Financial assessment follows finished services, approved cancellation or historical payment reconciliation.";
 if(r.status==='FULFILLMENT_RECONCILIATION_PENDING'&&lines.some(l=>!l.delivered||(l.context!=='TOUR_ONLY'&&!conditions.some(p=>p.line_id===l.lineId&&p.decision==='ACCEPT'))))blockedReason="Finish every service and obtain acceptance of each current return report first.";
 if(lines.some(l=>(l.delivered&&l.context!=='TOUR_ONLY'&&!conditions.some(p=>p.line_id===l.lineId&&p.decision==='ACCEPT'))||(!l.delivered&&events.some(e=>e.line_id===l.lineId))))blockedReason="Resolve active services and current return-report acceptance before assessment.";
 if(r.status==='CANCELLED_RECONCILIATION_PENDING'&&events.length)blockedReason="Cancellation contains delivery history requiring financial review.";
 if((await c.query("SELECT 1 FROM booking_payment_collection WHERE request_id=$1 AND quote_id<>$2 LIMIT 1",[r.id,q.id])).rowCount)blockedReason="Earlier quotation collections require separate reconciliation before this assessment.";
 const sourceDigest=digest({quoteId:q.id,quoteDigest:q.digest,status:r.status,lines,events,conditions,funds:funds.facts});
 return {quoteId:q.id as string,quoteDigest:q.digest as string,environment:account.environment as "MANUAL"|"DEMO",lines,conditions,sourceDigest,businessDigest:digest({quoteId:q.id,quoteDigest:q.digest,status:r.status,lines,events,conditions}),blockedReason,base,funds:funds.totals,policies:q.public_snapshot.policies as unknown[]};
}
// Caller holds the parent request lock. An accepted obligation protects retained funds.
export async function assertAssessmentRefundCapacity(c:PoolClient,requestId:string,quoteId:string,amount:number){
 const a=(await c.query("SELECT a.environment,a.body FROM booking_assessment a JOIN booking_assessment_decision d ON d.assessment_id=a.id AND d.decision='ACCEPT' WHERE a.request_id=$1 AND a.quote_id=$2 ORDER BY a.revision DESC LIMIT 1",[requestId,quoteId])).rows[0];
 if(!a)return;
 const f=await assessmentFunds(c,requestId,quoteId,a.environment,a.body.proposal.obligationCentavos);
 if(amount>f.totals.unreservedRefundDueCentavos)throw new DomainError("This refund would consume funds retained by the renter's accepted assessment. Correct the assessment or existing reservations first.",409);
}
