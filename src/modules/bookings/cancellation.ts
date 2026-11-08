import {assertGatewayResolved} from '../gateway/booking-guard';
import {randomUUID} from "node:crypto";
import type {PoolClient} from "pg";
import {transaction} from "../../lib/db";
import {uuid} from "../../lib/http";
import {storedActor,audit} from "../partners/service";
import {DomainError,type Actor} from "../partners/workflow";
import {digest} from "../cart/pricing";
import {lockBookingAuthority} from "./quotation";
import {cancellationCommand,canCancelStatus} from "./cancellation-schema";
async function context(c:PoolClient,actor:Actor,id:string,lock=false){
 const r=(await c.query(`SELECT id,agency_id,renter_id,status,version FROM booking_request WHERE id=$1${lock?" FOR UPDATE":""}`,[uuid.parse(id)])).rows[0],user=await storedActor(actor,c);
 if(!r)throw new DomainError("Request not found.",404);
 if((await c.query("SELECT is_test_fixture FROM app_actor WHERE id=$1",[user.id])).rows[0]?.is_test_fixture)throw new DomainError("Access denied.",403);
 const owner=r.renter_id===user.id,operator=!owner&&Boolean((await c.query("SELECT 1 FROM agency a JOIN app_actor o ON o.id=a.owner_id LEFT JOIN agency_member m ON m.agency_id=a.id AND m.actor_id=$2 WHERE a.id=$1 AND a.active AND NOT o.suspended AND NOT o.is_test_fixture AND (a.owner_id=$2 OR m.active)",[r.agency_id,user.id])).rowCount);
 if(!owner&&!operator)throw new DomainError("Request not found.",404);return {r,user,owner,operator};
}
type Context=Awaited<ReturnType<typeof context>>;
type CancellationBody={quote:{id:string;digest:string;revision:number}|null;services:{lineId:string;title:string;kind:string;startAt:string;endAt:string;cancellationPolicy:string;refundPolicy:string;damagePolicy:string;latePolicy:string}[]};
async function snapshot(c:PoolClient,id:string){
 const q=(await c.query("SELECT id,digest,revision,public_snapshot FROM booking_quotation WHERE request_id=$1 ORDER BY revision DESC LIMIT 1",[id])).rows[0],lines=(await c.query("SELECT id,public_quote,policy_snapshot FROM booking_request_line WHERE request_id=$1 ORDER BY id",[id])).rows;
 const body:CancellationBody={quote:q?{id:q.id,digest:q.digest,revision:q.revision}:null,services:lines.map(l=>{const service=q?.public_snapshot.lines.find((s:any)=>s.lineId===l.id)??l.public_quote,policy=q?.public_snapshot.policies?.find((s:any)=>s.lineId===l.id)??l.policy_snapshot;return {lineId:l.id,title:service.title,kind:service.kind,startAt:service.startAt,endAt:service.endAt,cancellationPolicy:policy.cancellationPolicy??"",refundPolicy:policy.refundPolicy??"",damagePolicy:policy.damagePolicy??"",latePolicy:policy.latePolicy??""};})};return body;
}
async function started(c:PoolClient,id:string){return Boolean((await c.query("SELECT 1 FROM booking_fulfillment_event WHERE request_id=$1 AND action IN ('RELEASE_RENTAL','START_TOUR') UNION ALL SELECT 1 FROM booking_actual_occupation WHERE request_id=$1 LIMIT 1",[id])).rowCount);}
async function records(c:PoolClient,id:string){return (await c.query("SELECT r.id,r.reason,r.body,r.digest,r.created_at,d.decision,d.reason AS decision_reason,d.created_at AS decided_at FROM booking_cancellation_request r LEFT JOIN booking_cancellation_decision d ON d.cancellation_id=r.id WHERE r.request_id=$1 ORDER BY r.created_at DESC,r.id DESC LIMIT 20",[id])).rows.map(r=>({id:r.id as string,reason:r.reason as string,body:r.body as CancellationBody,digest:r.digest as string,createdAt:(r.created_at as Date).toISOString(),decision:r.decision as "APPROVE"|"REJECT"|"WITHDRAW"|null,decisionReason:r.decision_reason as string|null,decidedAt:r.decided_at?(r.decided_at as Date).toISOString():null}));}
async function liabilities(c:PoolClient,id:string){
 const rows=(await c.query("SELECT environment,sum(amount_centavos)::text AS total FROM booking_payment_collection WHERE request_id=$1 GROUP BY environment",[id])).rows;
 const collections=rows.map(r=>({environment:r.environment as "MANUAL"|"DEMO",confirmedCentavos:Number(r.total)}));if(collections.some(r=>!Number.isSafeInteger(r.confirmedCentavos)))throw new DomainError("Financial total exceeds supported bounds.",409);
 const pendingManual=Boolean((await c.query("SELECT 1 FROM booking_payment_attempt t JOIN booking_payment_account a ON a.id=t.account_id WHERE t.request_id=$1 AND a.environment='MANUAL' AND t.method='GCASH' AND t.initial_outcome='SUBMITTED' AND NOT EXISTS(SELECT 1 FROM booking_payment_decision d WHERE d.attempt_id=t.id) LIMIT 1",[id])).rowCount);return {collections,pendingManual};
}
async function projection(c:PoolClient,ctx:Context){
 const history=await records(c,ctx.r.id),pending=history.find(r=>!r.decision)??null,hasStarted=await started(c,ctx.r.id),eligible=canCancelStatus(ctx.r.status)&&!hasStarted;
 return {requestId:ctx.r.id as string,requestVersion:ctx.r.version as number,status:ctx.r.status as string,isOwner:ctx.owner,isOperator:ctx.operator,hasStarted,pending,history,policies:await snapshot(c,ctx.r.id),...await liabilities(c,ctx.r.id),canRequest:ctx.owner&&eligible&&!pending&&history.length<20,canWithdraw:ctx.owner&&Boolean(pending),canReview:ctx.operator&&eligible&&Boolean(pending)};
}
export async function getCancellation(actor:Actor,id:string){return transaction(async c=>{await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");return projection(c,await context(c,actor,id));});}
async function releaseAllocation(c:PoolClient,id:string){
 const h=(await c.query("SELECT id FROM booking_hold WHERE request_id=$1 AND released_at IS NULL FOR UPDATE",[id])).rows[0];if(!h)return;
 const resources=(await c.query("SELECT o.id,o.resource_id FROM booking_hold_resource l JOIN resource_occupation o ON o.id=l.occupation_id WHERE l.hold_id=$1 ORDER BY o.resource_id,o.id",[h.id])).rows;
 await c.query("SELECT id FROM resource WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",[resources.map(r=>r.resource_id)]);
 const seats=(await c.query("SELECT schedule_id,sum(units)::int AS units FROM booking_hold_seat WHERE hold_id=$1 GROUP BY schedule_id ORDER BY schedule_id",[h.id])).rows;
 await c.query("SELECT id FROM tour_schedule WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",[seats.map(s=>s.schedule_id)]);
 await c.query("UPDATE resource_occupation SET cancelled_at=clock_timestamp(),cancellation_reason='Agency-approved pre-service cancellation' WHERE id=ANY($1::uuid[]) AND cancelled_at IS NULL",[resources.map(r=>r.id)]);
 for(const seat of seats)if(!(await c.query("UPDATE tour_schedule SET reserved_units=reserved_units-$2 WHERE id=$1 AND reserved_units>=$2 RETURNING id",[seat.schedule_id,seat.units])).rowCount)throw new DomainError("Departure allocation requires review before cancellation.",409);
 await c.query("UPDATE booking_hold SET released_at=clock_timestamp(),release_reason='CANCELLED' WHERE id=$1",[h.id]);
}
export async function changeCancellation(actor:Actor,id:string,input:unknown){
 const command=cancellationCommand.parse(input),hash=digest(command);
 return transaction(async c=>{
  const ctx=await context(c,actor,id,true),operator=command.action==="REVIEW_CANCELLATION";
  if(operator?!ctx.operator:!ctx.owner)throw new DomainError(operator?"Only an independent agency operator may review cancellation.":"Only the renter may request or withdraw cancellation.",403);
  await lockBookingAuthority(c,ctx,[ctx.r.renter_id],operator);
  const old=(await c.query("SELECT digest FROM booking_cancellation_command WHERE request_id=$1 AND actor_id=$2 AND idempotency_key=$3",[id,ctx.user.id,command.idempotencyKey])).rows[0];if(old){if(old.digest!==hash)throw new DomainError("This retry key belongs to another cancellation action.",409);return projection(c,ctx);}
  if(ctx.r.version!==command.version)throw new DomainError("This request changed. Reload cancellation before continuing.",409);
  const pending=(await records(c,id)).find(r=>!r.decision);let cancellationId:string;
  if(command.action==="REQUEST_CANCELLATION"){
   if(!canCancelStatus(ctx.r.status)||await started(c,id))throw new DomainError("Standard cancellation is available only before any vehicle handover or tour start. Resolve delivered-service issues through reconciliation.",409);
   if(pending)throw new DomainError("A cancellation request is already awaiting review.",409);
   if(Number((await c.query("SELECT count(*) n FROM booking_cancellation_request WHERE request_id=$1",[id])).rows[0].n)>=20)throw new DomainError("This booking reached its cancellation request history limit.",409);
   cancellationId=randomUUID();const body=await snapshot(c,id),now=(await c.query("SELECT clock_timestamp() now")).rows[0].now as Date,hash=digest({id:cancellationId,requestId:id,actorId:ctx.user.id,reason:command.reason,createdAt:now.toISOString(),body});
   await c.query("INSERT INTO booking_cancellation_request(id,request_id,quote_id,actor_id,reason,body,digest,created_at)VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[cancellationId,id,body.quote?.id??null,ctx.user.id,command.reason,body,hash,now]);
  }else{
   if(!pending||pending.id!==command.cancellationId||pending.digest!==command.digest)throw new DomainError("Review the exact current cancellation request.",409);
   cancellationId=pending.id;
   if(operator&&(!canCancelStatus(ctx.r.status)||await started(c,id)))throw new DomainError("Cancellation review is unavailable after service delivery or closure.",409);
   const decision=command.action==="WITHDRAW_CANCELLATION"?"WITHDRAW":command.decision;
   if(decision==="APPROVE"){
    await assertGatewayResolved(c,id);
    await releaseAllocation(c,id);const liability=await liabilities(c,id),status=liability.pendingManual||liability.collections.some(k=>k.confirmedCentavos>0)?"CANCELLED_RECONCILIATION_PENDING":"CANCELLED";
    await c.query("UPDATE booking_request SET status=$2 WHERE id=$1",[id,status]);ctx.r.status=status;
   }
   await c.query("INSERT INTO booking_cancellation_decision(id,cancellation_id,request_id,actor_id,decision,reason)VALUES($1,$2,$3,$4,$5,$6)",[randomUUID(),cancellationId,id,ctx.user.id,decision,command.reason]);
  }
  await c.query("INSERT INTO booking_cancellation_command(id,request_id,actor_id,idempotency_key,digest)VALUES($1,$2,$3,$4,$5)",[randomUUID(),id,ctx.user.id,command.idempotencyKey,hash]);
  await c.query("UPDATE booking_request SET version=version+1 WHERE id=$1",[id]);ctx.r.version++;
  const action=command.action==="REVIEW_CANCELLATION"?`CANCELLATION_${command.decision}`:command.action,message=command.action==="REQUEST_CANCELLATION"?"Cancellation requested. Inventory remains allocated under its current deadline; material progression is paused during review.":command.action==="WITHDRAW_CANCELLATION"?"Cancellation request withdrawn; current lifecycle and original hold deadline remain unchanged.":command.decision==="APPROVE"?"Pre-service cancellation approved and remaining allocations released. Refund and deposit review/payment are separate.":"Cancellation declined with reason; current lifecycle and original hold deadline remain unchanged.";
  await c.query("INSERT INTO booking_event(id,request_id,actor_id,action,message)VALUES($1,$2,$3,$4,$5)",[randomUUID(),id,ctx.user.id,action,message]);await audit(c,ctx.user,action,id,{cancellationId});
  await c.query("INSERT INTO booking_notification(id,request_id,recipient_id,message)SELECT gen_random_uuid(),$1,a.id,$2 FROM app_actor a WHERE NOT a.suspended AND (a.id=$3 OR a.id IN(SELECT actor_id FROM agency_member WHERE agency_id=$4 AND active) OR a.id IN(SELECT owner_id FROM agency WHERE id=$4))",[id,message,ctx.r.renter_id,ctx.r.agency_id]);return projection(c,ctx);
 });
}
