import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {transaction} from '../../lib/db';
import {audit} from '../partners/service';
import {DomainError,type Actor} from '../partners/workflow';
import {digest} from '../cart/pricing';
import {financialContext,financialLines,lockFinancialAuthority,type FinancialContext} from './finance-context';
import {assertFinancialOpen} from './finance-guard';
import {assessmentSource,assessmentFunds} from './assessment-source';
import {assertOwnerAllocationsAccepted} from './owner-allocation';
import type {AssessmentBody} from './assessment';
import {settlementCommand,settlementQuery} from './settlement-schema';
import {fundApplication,revenueAllocations,roundingRule,settlementConsent} from './settlement-calculation';

export async function financialOpenWork(c:PoolClient,id:string){
 const payments=Number((await c.query("SELECT count(*) n FROM booking_payment_attempt a WHERE request_id=$1 AND initial_outcome IN ('SUBMITTED','PENDING') AND NOT EXISTS(SELECT 1 FROM booking_payment_decision d WHERE d.attempt_id=a.id)",[id])).rows[0].n);
 const refunds=Number((await c.query("SELECT count(*) n FROM booking_refund_request r LEFT JOIN booking_refund_decision d ON d.refund_id=r.id WHERE r.request_id=$1 AND (d.decision IS NULL OR d.decision='APPROVE') AND NOT EXISTS(SELECT 1 FROM booking_refund_cancel x WHERE x.refund_id=r.id) AND NOT EXISTS(SELECT 1 FROM booking_refund_payment p WHERE p.refund_id=r.id)",[id])).rows[0].n);
 return {payments,refunds};
}
async function basis(c:PoolClient,ctx:FinancialContext){
 const a=(await c.query("SELECT a.id,a.revision,a.quote_id,a.environment,a.body,a.digest,d.decision FROM booking_assessment a LEFT JOIN booking_assessment_decision d ON d.assessment_id=a.id WHERE a.request_id=$1 ORDER BY a.revision DESC LIMIT 1",[ctx.r.id])).rows[0];
 const source=await assessmentSource(c,ctx.r);
 if(!a||!source)return {a:null,source:null,lines:[],allocations:[],funds:null,blockedReason:'An exact renter-accepted assessment is required before settlement.'};
 const lines=await financialLines(c,a.quote_id),body=a.body as AssessmentBody;
 let blockedReason=source.blockedReason;
 if(a.decision!=='ACCEPT')blockedReason='The renter must accept the exact current assessment first.';
 if(!blockedReason){try{await assertOwnerAllocationsAccepted(c,ctx.r.id,a.id);}catch(e){if(!(e instanceof DomainError))throw e;blockedReason='The applicable vehicle owners must accept their exact service credits and charge allocations.';}}
 const funds=(await assessmentFunds(c,ctx.r.id,a.quote_id,a.environment,body.proposal.obligationCentavos)).totals;
 const allocations=blockedReason?[]:revenueAllocations(body.proposal,lines);
 return {a,source,lines,allocations,funds,blockedReason};
}
type Basis=Awaited<ReturnType<typeof basis>>;
export type SettlementBody={public:{assessmentId:string;assessmentRevision:number;assessmentDigest:string;quoteId:string;environment:'MANUAL'|'DEMO';businessDigest:string;sourceDigest:string;quotedDepositCentavos:number;serviceCentavos:number;extraCentavos:number;obligationCentavos:number;netHeldCentavos:number;serviceAppliedCentavos:number;extraAppliedCentavos:number;refundDueCentavos:number;additionalBalanceCentavos:number;originalConfirmedCentavos:number;originalRefundsCentavos:number;consentText:string;roundingRule:string;outcome:'DELIVERED'|'CANCELLED'|'EXPIRED';finalStatus:'COMPLETED'|'CANCELLED'|'HOLD_EXPIRED'};allocations:ReturnType<typeof revenueAllocations>};
const rowSql='SELECT s.*,d.decision,d.reason AS decision_reason FROM booking_settlement s LEFT JOIN booking_settlement_decision d ON d.settlement_id=s.id';
async function outcome(c:PoolClient,ctx:FinancialContext){
 if(ctx.r.status==='FULFILLMENT_RECONCILIATION_PENDING')return {outcome:'DELIVERED',finalStatus:'COMPLETED'} as const;
 if(ctx.r.status==='CANCELLED_RECONCILIATION_PENDING')return {outcome:'CANCELLED',finalStatus:'CANCELLED'} as const;
 const h=(await c.query('SELECT release_reason FROM booking_hold WHERE request_id=$1 ORDER BY created_at DESC LIMIT 1',[ctx.r.id])).rows[0];
 if(ctx.r.status==='PAYMENT_RECONCILIATION_REQUIRED'&&h?.release_reason==='EXPIRED')return {outcome:'EXPIRED',finalStatus:'HOLD_EXPIRED'} as const;
 throw new DomainError('The original service outcome needs review before financial closing.',409);
}
function matching(row:any,b:Basis){const p=(row.body as SettlementBody).public;return Boolean(b.a&&b.source&&!b.blockedReason&&b.a.id===p.assessmentId&&b.a.digest===p.assessmentDigest&&b.source.businessDigest===p.businessDigest);}
function view(ctx:FinancialContext,row:any,b:Basis,closed:boolean){
 const body=row.body as SettlementBody,valid=matching(row,b),fresh=valid&&b.source!.sourceDigest===body.public.sourceDigest;
 return {id:row.id as string,revision:row.revision as number,digest:row.digest as string,reason:row.reason as string,createdAt:(row.created_at as Date).toISOString(),decision:row.decision as 'ACCEPT'|'DISPUTE'|'WITHDRAW'|null,decisionReason:row.decision_reason as string|null,terms:body.public,allocations:ctx.operator?body.allocations:undefined,
  stale:!closed&&!valid,canAccept:ctx.owner&&ctx.agencyActive&&!closed&&!row.decision&&fresh,canDispute:ctx.owner&&!closed&&!row.decision,canWithdraw:ctx.operator&&!closed&&!row.decision};
}
export async function settlementInTransaction(c:PoolClient,ctx:FinancialContext,page=1){
 const close=(await c.query('SELECT id,outcome,total_centavos,digest,created_at,body FROM booking_financial_close WHERE request_id=$1',[ctx.r.id])).rows[0],b=close?null:await basis(c,ctx);
 const empty={a:null,source:null,lines:[],allocations:[],funds:null,blockedReason:''},current=(await c.query(`${rowSql} WHERE s.request_id=$1 ORDER BY s.revision DESC LIMIT 1`,[ctx.r.id])).rows[0];
 const history=(await c.query(`${rowSql} WHERE s.request_id=$1 ORDER BY s.revision DESC LIMIT 20 OFFSET $2`,[ctx.r.id,(page-1)*20])).rows;
 const total=Number((await c.query('SELECT count(*) n FROM booking_settlement WHERE request_id=$1',[ctx.r.id])).rows[0].n),work=await financialOpenWork(c,ctx.r.id);
 const accepted=Boolean(current?.decision==='ACCEPT'&&b&&matching(current,b));
 return {requestId:ctx.r.id as string,requestVersion:ctx.r.version as number,status:ctx.r.status as string,isOwner:ctx.owner,isOperator:ctx.operator,blockedReason:b?.blockedReason??null,
  canPropose:ctx.operator&&!close&&Boolean(b?.a&&b.source&&!b.blockedReason&&b.a.body.sourceDigest===b.source.sourceDigest)&&(!current||Boolean(current.decision))&&work.payments===0&&work.refunds===0,
  current:current?view(ctx,current,b??empty,Boolean(close)):null,history:history.map(r=>view(ctx,r,b??empty,Boolean(close))),page,pageCount:Math.max(1,Math.ceil(total/20)),funds:b?.funds??null,openWork:work,
  canClose:ctx.operator&&!close&&accepted&&Boolean(b?.funds?.monetaryRequirementsSatisfied)&&work.payments===0&&work.refunds===0,
  close:close?{id:close.id as string,outcome:close.outcome as string,totalCentavos:Number(close.total_centavos),digest:close.digest as string,createdAt:(close.created_at as Date).toISOString(),funds:close.body.funds}:null};
}
export type SettlementState=Awaited<ReturnType<typeof settlementInTransaction>>;
export async function getSettlement(actor:Actor,id:string,query:unknown={}){const q=settlementQuery.parse(query);return transaction(async c=>{await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');return settlementInTransaction(c,await financialContext(c,actor,id),q.page);});}

/** Parent and ordered participant locks are required by every balance-collection caller. */
export async function acceptedSettlement(c:PoolClient,ctx:FinancialContext,settlementId:string,hash:string){
 await assertFinancialOpen(c,ctx.r.id);const b=await basis(c,ctx),row=(await c.query(`${rowSql} WHERE s.request_id=$1 ORDER BY s.revision DESC LIMIT 1`,[ctx.r.id])).rows[0];
 if(!row||row.id!==settlementId||row.digest!==hash||row.decision!=='ACCEPT'||!matching(row,b))throw new DomainError('Review the exact current renter-accepted settlement before collecting a balance.',409);
 return {row,b};
}
export async function settlementEvent(c:PoolClient,ctx:FinancialContext,action:string,message:string){
 await c.query('UPDATE booking_request SET version=version+1 WHERE id=$1',[ctx.r.id]);ctx.r.version++;
 await c.query('INSERT INTO booking_event(id,request_id,actor_id,action,message)VALUES($1,$2,$3,$4,$5)',[randomUUID(),ctx.r.id,ctx.user.id,action,message]);await audit(c,ctx.user,action,ctx.r.id);
 await c.query('INSERT INTO booking_notification(id,request_id,recipient_id,message)SELECT gen_random_uuid(),$1,a.id,$2 FROM app_actor a WHERE NOT a.suspended AND (a.id=$3 OR a.id IN(SELECT actor_id FROM agency_member WHERE agency_id=$4 AND active) OR a.id IN(SELECT owner_id FROM agency WHERE id=$4))',[ctx.r.id,message,ctx.r.renter_id,ctx.r.agency_id]);
}
export async function changeSettlement(actor:Actor,id:string,input:unknown){
 const command=settlementCommand.parse(input),hash=digest(command);
 return transaction(async c=>{
  const ctx=await financialContext(c,actor,id,true),operator=command.action!=='DECIDE_SETTLEMENT';
  if(operator?!ctx.operator:!ctx.owner)throw new DomainError(operator?'An independent agency operator is required.':'Only the renter can accept or dispute this settlement.',403);
  const quote=(await c.query('SELECT id FROM booking_quotation WHERE request_id=$1 ORDER BY revision DESC LIMIT 1',[id])).rows[0];
  await lockFinancialAuthority(c,ctx,operator,quote?await financialLines(c,quote.id):[]);
  const old=(await c.query('SELECT digest FROM booking_settlement_command WHERE request_id=$1 AND actor_id=$2 AND idempotency_key=$3',[id,ctx.user.id,command.idempotencyKey])).rows[0];
  if(old){if(old.digest!==hash)throw new DomainError('This retry key belongs to another settlement action.',409);return settlementInTransaction(c,ctx);}
  await assertFinancialOpen(c,id);if(ctx.r.version!==command.version)throw new DomainError('This booking changed. Refresh settlement before continuing.',409);
  const b=await basis(c,ctx),latest=(await c.query(`${rowSql} WHERE s.request_id=$1 ORDER BY s.revision DESC LIMIT 1`,[id])).rows[0];
  if(command.action==='PROPOSE_SETTLEMENT'){
   const work=await financialOpenWork(c,id);
   if(!b.a||!b.source||!b.funds||b.blockedReason)throw new DomainError(b.blockedReason??'Current financial assessment required.',409);
   if(b.a.body.sourceDigest!==b.source.sourceDigest)throw new DomainError('Financial facts changed. Obtain an updated assessment before proposing settlement.',409);
   if(latest&&!latest.decision)throw new DomainError('Resolve or withdraw the pending settlement first.',409);
   if(work.payments||work.refunds)throw new DomainError('Resolve pending payment and refund work before proposing settlement.',409);
   const p=(b.a.body as AssessmentBody).proposal,body:SettlementBody={public:{assessmentId:b.a.id,assessmentRevision:b.a.revision,assessmentDigest:b.a.digest,quoteId:b.a.quote_id,environment:b.a.environment,businessDigest:b.source.businessDigest,sourceDigest:b.source.sourceDigest,quotedDepositCentavos:p.quotedDepositCentavos,...fundApplication(p.deliveredServiceCentavos-p.serviceCreditCentavos,p.extraChargeCentavos,b.funds.netHeldCentavos),originalConfirmedCentavos:b.funds.confirmedCentavos,originalRefundsCentavos:b.funds.paidRefundCentavos,consentText:settlementConsent,roundingRule,...await outcome(c,ctx)},allocations:b.allocations};
   const settlementId=randomUUID(),revision=(latest?.revision??0)+1,createdAt=(await c.query('SELECT clock_timestamp() n')).rows[0].n as Date,savedDigest=digest({id:settlementId,requestId:id,revision,body,reason:command.reason,createdAt:createdAt.toISOString()});
   await c.query('INSERT INTO booking_settlement(id,request_id,quote_id,assessment_id,revision,environment,actor_id,reason,body,digest,created_at)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[settlementId,id,b.a.quote_id,b.a.id,revision,b.a.environment,ctx.user.id,command.reason,body,savedDigest,createdAt]);
  }else{
   if(!latest||latest.id!==command.settlementId||latest.digest!==command.digest)throw new DomainError('Review the exact current settlement.',409);
   if(command.action==='CLOSE_FINANCIAL_RECORD'){
    if(latest.decision!=='ACCEPT'||!matching(latest,b)||!b.funds?.monetaryRequirementsSatisfied)throw new DomainError('Accepted terms and fully reconciled funds are required for closing.',409);
    const work=await financialOpenWork(c,id);if(work.payments||work.refunds)throw new DomainError('Resolve all pending payment and refund work first.',409);
    const body=latest.body as SettlementBody;
    if(digest(b.allocations)!==digest(body.allocations))throw new DomainError('Original allocation terms changed. Review the financial source.',409);
    if((await c.query('SELECT 1 FROM booking_actual_occupation WHERE request_id=$1 AND closed_at IS NULL LIMIT 1',[id])).rowCount)throw new DomainError('A physical resource is still out.',409);
    const closeId=randomUUID(),record={settlementId:latest.id,settlementDigest:latest.digest,assessmentId:body.public.assessmentId,terms:body.public,funds:b.funds,allocations:body.allocations,reason:command.reason};
    await c.query('INSERT INTO booking_financial_close(id,request_id,quote_id,settlement_id,agency_id,environment,actor_id,outcome,total_centavos,body,digest)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[closeId,id,latest.quote_id,latest.id,ctx.r.agency_id,latest.environment,ctx.user.id,body.public.outcome,body.public.obligationCentavos,record,digest(record)]);
    for(const e of b.allocations)await c.query('INSERT INTO booking_revenue_entry(id,close_id,request_id,quote_id,line_id,agency_id,environment,source_kind,source_id,recipient,beneficiary_actor_id,vehicle_id,basis_centavos,bps,amount_centavos,policy_snapshot)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',[randomUUID(),closeId,id,latest.quote_id,e.lineId,ctx.r.agency_id,latest.environment,e.sourceKind,e.sourceId,e.recipient,e.beneficiaryActorId,e.vehicleId,e.basisCentavos,e.bps,e.amountCentavos,e.policy]);
    await c.query('UPDATE booking_request SET status=$2 WHERE id=$1',[id,body.public.finalStatus]);ctx.r.status=body.public.finalStatus;
   }else{
    if(latest.decision)throw new DomainError('This settlement already has a decision.',409);
    const decision=command.action==='WITHDRAW_SETTLEMENT'?'WITHDRAW':command.decision;
    if(decision==='ACCEPT'&&(!matching(latest,b)||b.source!.sourceDigest!==latest.body.public.sourceDigest))throw new DomainError('Facts changed. The agency must prepare an updated settlement.',409);
    await c.query('INSERT INTO booking_settlement_decision(id,settlement_id,request_id,actor_id,decision,reason)VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),latest.id,id,ctx.user.id,decision,command.reason]);
   }
  }
  await c.query('INSERT INTO booking_settlement_command(id,request_id,actor_id,idempotency_key,digest)VALUES($1,$2,$3,$4,$5)',[randomUUID(),id,ctx.user.id,command.idempotencyKey,hash]);
  const action=command.action==='DECIDE_SETTLEMENT'?`SETTLEMENT_${command.decision}`:command.action;
  await settlementEvent(c,ctx,action,command.action==='CLOSE_FINANCIAL_RECORD'?'Financial reconciliation closed and conserved revenue allocations recorded. Service outcome is preserved.':'Settlement review recorded. Acceptance does not itself record a collection, refund or payout.');
  return settlementInTransaction(c,ctx);
 });
}
