import {randomUUID} from "node:crypto";
import type {PoolClient} from "pg";
import {transaction} from "../../lib/db";
import {uuid} from "../../lib/http";
import {storedActor,audit} from "../partners/service";
import {approvedExtraChargePolicy} from "../partners/extra-charge-policy";
import {DomainError,type Actor} from "../partners/workflow";
import {digest} from "../cart/pricing";
import {lockBookingAuthority} from "./quotation";
import {calculateAssessmentProposal} from "./assessment-calculation";
import {assessmentSource,assessmentFunds} from "./assessment-source";
import {assessmentCommand,assessmentQuery} from "./assessment-schema";

async function context(c:PoolClient,actor:Actor,id:string,lock=false){
 const r=(await c.query(`SELECT id,agency_id,renter_id,status,version FROM booking_request WHERE id=$1${lock?' FOR UPDATE':''}`,[uuid.parse(id)])).rows[0],user=await storedActor(actor,c);
 if(!r)throw new DomainError("Request not found.",404);
 if((await c.query("SELECT is_test_fixture FROM app_actor WHERE id=$1",[user.id])).rows[0]?.is_test_fixture)throw new DomainError("Access denied.",403);
 const a=(await c.query("SELECT a.active AND NOT o.suspended AND NOT o.is_test_fixture AS active,(a.owner_id=$2 OR EXISTS(SELECT 1 FROM agency_member m WHERE m.agency_id=a.id AND m.actor_id=$2 AND m.active)) AS operator FROM agency a JOIN app_actor o ON o.id=a.owner_id WHERE a.id=$1",[r.agency_id,user.id])).rows[0];
 const owner=r.renter_id===user.id,agencyActive=Boolean(a?.active),operator=!owner&&agencyActive&&Boolean(a?.operator);
 if(!owner&&!operator)throw new DomainError("Request not found.",404);
 return {r,user,owner,operator,agencyActive};
}
type Context=Awaited<ReturnType<typeof context>>;
type Source=NonNullable<Awaited<ReturnType<typeof assessmentSource>>>;
export type AssessmentBody={quoteId:string;quoteDigest:string;sourceDigest:string;proposal:ReturnType<typeof calculateAssessmentProposal>;funds:Source['funds'];conditions:Source['conditions'];policies:unknown[];requiresOwnerAllocationReview:boolean};
const rowsSql="SELECT a.*,d.decision,d.reason AS decision_reason FROM booking_assessment a LEFT JOIN booking_assessment_decision d ON d.assessment_id=a.id";
function view(ctx:Context,r:any,source:Source|null){
 const body=r.body as AssessmentBody,stale=!source||body.sourceDigest!==source.sourceDigest;
 return {id:r.id as string,revision:r.revision as number,digest:r.digest as string,createdAt:(r.created_at as Date).toISOString(),reason:r.reason as string,environment:r.environment as "MANUAL"|"DEMO",body,decision:r.decision as "ACCEPT"|"DISPUTE"|"WITHDRAW"|null,decisionReason:r.decision_reason as string|null,stale,
 canAccept:ctx.owner&&ctx.agencyActive&&!r.decision&&!stale&&!source?.blockedReason&&body.funds.overReservedCentavos===0,
 canDispute:ctx.owner&&!r.decision,canWithdraw:ctx.operator&&!r.decision};
}
async function projection(c:PoolClient,ctx:Context,historyPage=1){
 const source=await assessmentSource(c,ctx.r);
 const current=(await c.query(`${rowsSql} WHERE a.request_id=$1 ORDER BY a.revision DESC LIMIT 1`,[ctx.r.id])).rows[0];
 const total=Number((await c.query("SELECT count(*) n FROM booking_assessment WHERE request_id=$1",[ctx.r.id])).rows[0].n);
 const history=(await c.query(`${rowsSql} WHERE a.request_id=$1 ORDER BY a.revision DESC LIMIT 20 OFFSET $2`,[ctx.r.id,(historyPage-1)*20])).rows.map(r=>view(ctx,r,source));
 const effective=(await c.query(`${rowsSql} WHERE a.request_id=$1 AND d.decision='ACCEPT' ORDER BY a.revision DESC LIMIT 1`,[ctx.r.id])).rows[0];
 return {requestId:ctx.r.id as string,requestVersion:ctx.r.version as number,status:ctx.r.status as string,isOwner:ctx.owner,isOperator:ctx.operator,source,
 canPropose:ctx.operator&&Boolean(source&&!source.blockedReason)&&(!current||Boolean(current.decision)),current:current?view(ctx,current,source):null,effective:effective?view(ctx,effective,source):null,history,historyPage,historyPages:Math.max(1,Math.ceil(total/20))};
}
export type AssessmentState=Awaited<ReturnType<typeof projection>>;
export async function getAssessments(actor:Actor,id:string,query:unknown={}){
 const {historyPage}=assessmentQuery.parse(query);
 return transaction(async c=>{await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");return projection(c,await context(c,actor,id),historyPage);});
}
export async function changeAssessment(actor:Actor,id:string,input:unknown){
 const command=assessmentCommand.parse(input),hash=digest(command);
 return transaction(async c=>{
  const ctx=await context(c,actor,id,true),operator=command.action!=='DECIDE_ASSESSMENT';
  if(operator?!ctx.operator:!ctx.owner)throw new DomainError(operator?"An independent agency operator must propose or withdraw the assessment.":"Only the renter may accept or dispute the assessment.",403);
  const authority=await lockBookingAuthority(c,ctx,[ctx.r.renter_id],operator);ctx.agencyActive=authority.active;
  const old=(await c.query("SELECT digest FROM booking_assessment_command WHERE request_id=$1 AND actor_id=$2 AND idempotency_key=$3",[id,ctx.user.id,command.idempotencyKey])).rows[0];
  if(old){if(old.digest!==hash)throw new DomainError("This retry key belongs to another financial action.",409);return projection(c,ctx);}
  if(ctx.r.version!==command.version)throw new DomainError("This booking changed. Reload the assessment before continuing.",409);
  const source=await assessmentSource(c,ctx.r),latest=(await c.query(`${rowsSql} WHERE a.request_id=$1 ORDER BY a.revision DESC LIMIT 1`,[id])).rows[0];
  let assessmentId:string;
  if(command.action==='PROPOSE_ASSESSMENT'){
   if(!source||source.blockedReason)throw new DomainError(source?.blockedReason??"An original quotation payment account is required for assessment.",409);
   if(latest&&!latest.decision)throw new DomainError("Withdraw or resolve the pending assessment before proposing another revision.",409);
   if(ctx.r.status==='PAYMENT_RECONCILIATION_REQUIRED'&&command.charges.length)throw new DomainError("Historical payment reconciliation does not establish an agreed cancellation charge.",409);
   const charges=[];
   for(const item of command.charges){const line=source.lines.find(l=>l.lineId===item.lineId);if(!line)throw new DomainError("Extra charge service not found.",409);charges.push({...item,policy:await approvedExtraChargePolicy(c,ctx.r.agency_id,item.type,line.context)});}
   // The public command's type selects policy; the saved calculation retains the exact policy itself.
   const proposal=calculateAssessmentProposal({lines:source.lines,credits:command.credits,charges:charges.map(({type:_,...item})=>item)});
   const funds=(await assessmentFunds(c,id,source.quoteId,source.environment,proposal.obligationCentavos)).totals;
   const body:AssessmentBody={quoteId:source.quoteId,quoteDigest:source.quoteDigest,sourceDigest:source.sourceDigest,proposal,funds,conditions:source.conditions,policies:source.policies,requiresOwnerAllocationReview:proposal.charges.some(i=>i.policy.policy.context==='CONSIGNED')};
   const now=(await c.query("SELECT clock_timestamp() now")).rows[0].now as Date,revision=(latest?.revision??0)+1;
   assessmentId=randomUUID();const savedDigest=digest({id:assessmentId,requestId:id,revision,reason:command.reason,createdAt:now.toISOString(),body});
   await c.query("INSERT INTO booking_assessment(id,request_id,quote_id,revision,environment,actor_id,reason,body,digest,created_at)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",[assessmentId,id,source.quoteId,revision,source.environment,ctx.user.id,command.reason,body,savedDigest,now]);
  }else{
   if(!latest||latest.id!==command.assessmentId||latest.digest!==command.digest||latest.decision)throw new DomainError("Review the exact current pending assessment.",409);
   assessmentId=latest.id;
   const decision=command.action==='WITHDRAW_ASSESSMENT'?'WITHDRAW':command.decision;
   if(decision==='ACCEPT'&&(!source||source.blockedReason||!ctx.agencyActive||source.sourceDigest!==latest.body.sourceDigest||latest.body.funds.overReservedCentavos>0))throw new DomainError("Financial or condition facts changed, or refunds over-reserve retained funds. The agency must issue a corrected assessment.",409);
   await c.query("INSERT INTO booking_assessment_decision(id,assessment_id,request_id,actor_id,decision,reason)VALUES($1,$2,$3,$4,$5,$6)",[randomUUID(),assessmentId,id,ctx.user.id,decision,command.reason]);
  }
  await c.query("INSERT INTO booking_assessment_command(id,request_id,actor_id,idempotency_key,digest)VALUES($1,$2,$3,$4,$5)",[randomUUID(),id,ctx.user.id,command.idempotencyKey,hash]);
  await c.query("UPDATE booking_request SET version=version+1 WHERE id=$1",[id]);ctx.r.version++;
  const action=command.action==='DECIDE_ASSESSMENT'?`ASSESSMENT_${command.decision}`:command.action,message="Itemized financial assessment review recorded. No money moves; deposits, balance collection, owner agreement and financial completion remain separate.";
  await c.query("INSERT INTO booking_event(id,request_id,actor_id,action,message)VALUES($1,$2,$3,$4,$5)",[randomUUID(),id,ctx.user.id,action,message]);await audit(c,ctx.user,action,id,{assessmentId});
  await c.query("INSERT INTO booking_notification(id,request_id,recipient_id,message)SELECT gen_random_uuid(),$1,a.id,$2 FROM app_actor a WHERE NOT a.suspended AND (a.id=$3 OR a.id IN(SELECT actor_id FROM agency_member WHERE agency_id=$4 AND active) OR a.id IN(SELECT owner_id FROM agency WHERE id=$4))",[id,message,ctx.r.renter_id,ctx.r.agency_id]);
  return projection(c,ctx);
 });
}
