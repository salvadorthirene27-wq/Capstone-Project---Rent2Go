import {assertFinancialOpen} from "./finance-guard";
import {assertNoPendingCancellation,cancellationPending} from "./cancellation-guard";
import {randomUUID} from "node:crypto";
import type {PoolClient} from "pg";
import {transaction} from "../../lib/db";
import {uuid,versionSchema} from "../../lib/http";
import {storedActor,audit} from "../partners/service";
import {DomainError,type Actor} from "../partners/workflow";
import {digest} from "../cart/pricing";
import {lockBookingAuthority} from "./quotation";
import {fulfillmentCommand,inspectionPhase,fulfillmentStage} from "./fulfillment-schema";

async function context(c:PoolClient,actor:Actor,id:string,lock=false){
 const r=(await c.query(`SELECT id,agency_id,renter_id,status,version FROM booking_request WHERE id=$1${lock?" FOR UPDATE":""}`,[uuid.parse(id)])).rows[0],user=await storedActor(actor,c);
 if(!r)throw new DomainError("Request not found.",404);
 if((await c.query("SELECT is_test_fixture FROM app_actor WHERE id=$1",[user.id])).rows[0]?.is_test_fixture)throw new DomainError("Access denied.",403);
 const owner=r.renter_id===user.id,operator=!owner&&Boolean((await c.query("SELECT 1 FROM agency a JOIN app_actor o ON o.id=a.owner_id LEFT JOIN agency_member m ON m.agency_id=a.id AND m.actor_id=$2 WHERE a.id=$1 AND a.active AND NOT o.suspended AND NOT o.is_test_fixture AND (a.owner_id=$2 OR m.active)",[r.agency_id,user.id])).rowCount);
 if(!owner&&!operator)throw new DomainError("Request not found.",404);
 return {r,user,owner,operator};
}
type Context=Awaited<ReturnType<typeof context>>;
async function allocation(c:PoolClient,ctx:Context,lock=false){
 const q=(await c.query("SELECT id,digest,public_snapshot FROM booking_quotation WHERE request_id=$1 ORDER BY revision DESC LIMIT 1",[ctx.r.id])).rows[0];
 if(!q)return null;
 const h=(await c.query(`SELECT h.id,h.released_at,EXISTS(SELECT 1 FROM booking_hold_commitment k WHERE k.hold_id=h.id) AS committed FROM booking_hold h WHERE h.quote_id=$1${lock?" FOR UPDATE":""}`,[q.id])).rows[0];
 const a=(await c.query("SELECT a.id,a.digest,a.quote_digest,s.agreement_digest FROM booking_agreement a JOIN booking_agreement_signature s ON s.agreement_id=a.id WHERE a.quote_id=$1 ORDER BY a.revision DESC LIMIT 1",[q.id])).rows[0];
 const p=(await c.query("SELECT a.environment,COALESCE(sum(k.amount_centavos),0)::text AS confirmed FROM booking_payment_account a LEFT JOIN booking_payment_collection k ON k.account_id=a.id WHERE a.quote_id=$1 GROUP BY a.id",[q.id])).rows[0];
 const accepted=Boolean((await c.query("SELECT 1 FROM booking_quotation_decision WHERE quote_id=$1 AND action='ACCEPTED'",[q.id])).rowCount),active=Boolean(h?.committed&&!h.released_at);
 const funded=Boolean(active&&a&&accepted&&a.quote_digest===q.digest&&a.agreement_digest===a.digest&&p&&BigInt(p.confirmed)>=BigInt(q.public_snapshot.totals.totalCentavos));
 return {q,h,funded,environment:p?.environment as "MANUAL"|"DEMO"|undefined};
}
async function report(c:PoolClient,quoteId:string,lineId:string,phase:string,exactId?:string){
 const r=(await c.query(`SELECT i.id,i.phase,i.revision,i.body,i.digest,i.created_at,a.decision,a.reason,a.created_at AS acknowledged_at FROM booking_inspection i LEFT JOIN booking_inspection_ack a ON a.inspection_id=i.id WHERE i.quote_id=$1 AND i.line_id=$2 AND i.phase=$3 ${exactId?"AND i.id=$4":""} ORDER BY i.revision DESC LIMIT 1`,exactId?[quoteId,lineId,phase,exactId]:[quoteId,lineId,phase])).rows[0];
 return r?{id:r.id as string,phase:r.phase as "PRE"|"POST",revision:r.revision as number,body:r.body as import("./fulfillment-schema").InspectionCondition,digest:r.digest as string,createdAt:(r.created_at as Date).toISOString(),decision:r.decision as "ACCEPT"|"DISPUTE"|null,reason:r.reason as string|null,acknowledgedAt:r.acknowledged_at?(r.acknowledged_at as Date).toISOString():null}:null;
}
export type SavedInspection=NonNullable<Awaited<ReturnType<typeof report>>>;
async function physical(c:PoolClient,quoteId:string,lineId:string){
 const rows=(await c.query("SELECT action,details,created_at FROM booking_fulfillment_event WHERE quote_id=$1 AND line_id=$2 ORDER BY created_at,id",[quoteId,lineId])).rows;
 const actions=new Set(rows.map(r=>r.action));return {rows,action:actions.has("RECORD_RETURN")?"RECORD_RETURN":actions.has("RELEASE_RENTAL")?"RELEASE_RENTAL":actions.has("COMPLETE_TOUR")?"COMPLETE_TOUR":actions.has("START_TOUR")?"START_TOUR":null};
}
async function requirementsValid(c:PoolClient,id:string,line:any){
 const purposes=line.kind==="RENTAL"&&line.selection?.mode==="SELF_DRIVE"?["IDENTITY","DRIVER_LICENSE"]:["IDENTITY"];
 const result=await c.query("SELECT s.purpose,d.decision,f.expires_on IS NULL OR f.expires_on>=GREATEST((($2::timestamptz-interval '1 microsecond') AT TIME ZONE 'Asia/Manila')::date,(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date) AS valid FROM booking_requirement_selection s JOIN booking_requirement_file f ON f.id=s.file_id JOIN booking_requirement_decision d ON d.submission_id=s.submission_id AND d.file_id=s.file_id WHERE s.submission_id=(SELECT id FROM booking_requirement_submission WHERE request_id=$1 ORDER BY version DESC LIMIT 1)",[id,line.endAt]);
 return purposes.every(p=>result.rows.some(r=>r.purpose===p&&r.decision==="ACCEPTED"&&r.valid));
}
async function lineState(c:PoolClient,ctx:Context,a:NonNullable<Awaited<ReturnType<typeof allocation>>>,line:any,now:Date){
 const pre=await report(c,a.q.id,line.lineId,"PRE"),post=await report(c,a.q.id,line.lineId,"POST"),p=await physical(c,a.q.id,line.lineId),stage=fulfillmentStage(line.kind,p.action,post?.decision??null),started=stage!=="NOT_STARTED",inWindow=Date.parse(line.startAt)<=now.getTime()&&now.getTime()<Date.parse(line.endAt);
 const paused=await cancellationPending(c,ctx.r.id),base=!paused&&ctx.operator&&a.funded&&["READY_FOR_SERVICE","SERVICE_ACTIVE","FULFILLMENT_RECONCILIATION_PENDING"].includes(ctx.r.status),rental=line.kind==="RENTAL";
 const safetyHold=rental&&Boolean((await c.query("SELECT booking_return_safety_hold($1,$2) AS blocked",[a.q.id,line.lineId])).rows[0].blocked);
 const inspectionHistory=(await c.query("SELECT i.id,i.phase,i.revision,i.created_at,a.decision FROM booking_inspection i LEFT JOIN booking_inspection_ack a ON a.inspection_id=i.id WHERE i.quote_id=$1 AND i.line_id=$2 ORDER BY i.created_at DESC,i.id DESC LIMIT 20",[a.q.id,line.lineId])).rows.map(r=>({id:r.id as string,phase:r.phase as string,revision:r.revision as number,createdAt:(r.created_at as Date).toISOString(),decision:r.decision as string|null}));
 const availablePhotos=ctx.operator?(await c.query("SELECT f.id,f.phase FROM booking_inspection_file f WHERE f.request_id=$1 AND f.quote_id=$2 AND f.line_id=$3 ORDER BY f.created_at DESC LIMIT 30",[ctx.r.id,a.q.id,line.lineId])).rows:[];
 return {id:line.lineId as string,title:line.title as string,kind:line.kind as "RENTAL"|"TOUR",startAt:line.startAt as string,endAt:line.endAt as string,partySize:line.partySize as number,driverName:line.driverName as string|null,stage,safetyHold,pre,post,inspectionHistory,availablePhotos:availablePhotos as {id:string;phase:"PRE"|"POST"}[],history:p.rows.map(r=>({action:r.action as string,details:r.details as {note?:string;attendance?:number},at:(r.created_at as Date).toISOString()})),canInspectPre:Boolean(base&&rental&&!started),canInspectPost:Boolean(base&&rental&&(stage==="RENTAL_ACTIVE"||stage==="RETURN_REVIEW"||stage==="RETURN_DISPUTED"||safetyHold)),canAcknowledgePre:Boolean(!paused&&ctx.owner&&pre&&!pre.decision&&!started),canAcknowledgePost:Boolean(!paused&&ctx.owner&&post&&!post.decision),canRelease:Boolean(base&&rental&&!started&&pre?.decision==="ACCEPT"&&pre.body.roadworthy&&pre.body.safetyChecked&&inWindow&&await requirementsValid(c,ctx.r.id,line)),canStartTour:Boolean(base&&!rental&&!started&&inWindow&&await requirementsValid(c,ctx.r.id,line)),canCompleteTour:Boolean(base&&!rental&&stage==="TOUR_ACTIVE"),overdue:stage==="RENTAL_ACTIVE"&&now.getTime()>=Date.parse(line.endAt)};
}
async function savedLines(c:PoolClient,id:string){return (await c.query("SELECT id,public_quote FROM booking_request_line WHERE request_id=$1",[id])).rows;}
async function projection(c:PoolClient,ctx:Context){
 const a=await allocation(c,ctx),now=(await c.query<{now:Date}>("SELECT clock_timestamp() AS now")).rows[0].now,source=await savedLines(c,ctx.r.id),lines=[];
 if(a)for(const line of a.q.public_snapshot.lines)lines.push(await lineState(c,ctx,a,{...line,selection:source.find(s=>s.id===line.lineId)?.public_quote.selection},now));
 return {serverNow:now.toISOString(),requestId:ctx.r.id,requestVersion:ctx.r.version,status:ctx.r.status,isOwner:ctx.owner,isOperator:ctx.operator,environment:a?.environment??null,funded:a?.funded??false,lines};
}
export async function getFulfillment(actor:Actor,id:string){return transaction(async c=>{await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");return projection(c,await context(c,actor,id));});}
async function lockAuthority(c:PoolClient,ctx:Context,operator:boolean){
 const owners=(await c.query("SELECT DISTINCT v.owner_actor_id FROM booking_hold h JOIN booking_hold_resource l ON l.hold_id=h.id JOIN resource_occupation o ON o.id=l.occupation_id JOIN resource r ON r.id=o.resource_id JOIN physical_vehicle v ON v.id=r.vehicle_id WHERE h.request_id=$1 AND h.released_at IS NULL AND v.owner_actor_id IS NOT NULL",[ctx.r.id])).rows;
 const active=await lockBookingAuthority(c,ctx,[ctx.r.renter_id,...owners.map(v=>v.owner_actor_id as string)],operator);
 if(!active.active)throw new DomainError("Agency unavailable.",409);
 const user=(await c.query("SELECT suspended,is_test_fixture FROM app_actor WHERE id=$1",[ctx.user.id])).rows[0];if(!user||user.suspended||user.is_test_fixture)throw new DomainError("Access denied.",403);
}
function version(ctx:Context,n:number){if(ctx.r.version!==n)throw new DomainError("This request changed. Reload fulfillment before continuing.",409);}
async function exactLine(c:PoolClient,ctx:Context,lineId:string){
 await assertNoPendingCancellation(c,ctx.r.id);
 const a=await allocation(c,ctx,true);if(!a?.funded||!["READY_FOR_SERVICE","SERVICE_ACTIVE","FULFILLMENT_RECONCILIATION_PENDING"].includes(ctx.r.status))throw new DomainError("Full payment, signed agreement and committed allocation are required.",409);
 const l=a.q.public_snapshot.lines.find((v:any)=>v.lineId===lineId),saved=(await c.query("SELECT public_quote,policy_snapshot FROM booking_request_line WHERE id=$1 AND request_id=$2",[uuid.parse(lineId),ctx.r.id])).rows[0];
 if(!l||!saved)throw new DomainError("Service not found.",404);return {a,line:{...l,selection:saved.public_quote.selection},policy:saved.policy_snapshot};
}
async function event(c:PoolClient,ctx:Context,quoteId:string,lineId:string,action:string,details:unknown){await c.query("INSERT INTO booking_fulfillment_event(id,request_id,quote_id,line_id,actor_id,action,details)VALUES($1,$2,$3,$4,$5,$6,$7)",[randomUUID(),ctx.r.id,quoteId,lineId,ctx.user.id,action,details]);}
async function refreshStatus(c:PoolClient,ctx:Context,a:NonNullable<Awaited<ReturnType<typeof allocation>>>){
 const events=(await c.query("SELECT line_id,action FROM booking_fulfillment_event WHERE quote_id=$1",[a.q.id])).rows;
 const finished=a.q.public_snapshot.lines.every((l:any)=>events.some(e=>e.line_id===l.lineId&&e.action===(l.kind==="RENTAL"?"RECORD_RETURN":"COMPLETE_TOUR"))),status=finished?"FULFILLMENT_RECONCILIATION_PENDING":events.length?"SERVICE_ACTIVE":"READY_FOR_SERVICE";
 await c.query("UPDATE booking_request SET status=$2,version=version+1 WHERE id=$1",[ctx.r.id,status]);ctx.r.status=status;ctx.r.version++;
}
async function note(c:PoolClient,ctx:Context,action:string,message:string){
 await c.query("INSERT INTO booking_event(id,request_id,actor_id,action,message)VALUES($1,$2,$3,$4,$5)",[randomUUID(),ctx.r.id,ctx.user.id,action,message]);await audit(c,ctx.user,action,ctx.r.id,{message});
 await c.query("INSERT INTO booking_notification(id,request_id,recipient_id,message)SELECT gen_random_uuid(),$1,a.id,$2 FROM app_actor a WHERE NOT a.suspended AND (a.id=$3 OR a.id IN(SELECT actor_id FROM agency_member WHERE agency_id=$4 AND active))",[ctx.r.id,message,ctx.r.renter_id,ctx.r.agency_id]);
}
async function resourceRows(c:PoolClient,ctx:Context,quoteId:string,lineId:string){
 const rows=(await c.query("SELECT o.resource_id,r.kind,r.active,o.cancelled_at FROM booking_hold_resource l JOIN resource_occupation o ON o.id=l.occupation_id JOIN resource r ON r.id=o.resource_id WHERE l.quote_id=$1 AND l.line_id=$2 ORDER BY o.resource_id",[quoteId,lineId])).rows;
 if(!rows.some(r=>r.kind==="VEHICLE")||rows.some(r=>r.cancelled_at))throw new DomainError("The saved resource allocation is unavailable.",409);
 const locked=(await c.query("SELECT id,active FROM resource WHERE id=ANY($1::uuid[]) AND agency_id=$2 ORDER BY id FOR UPDATE",[rows.map(r=>r.resource_id),ctx.r.agency_id])).rows;
 if(locked.length!==rows.length)throw new DomainError("Resource agency changed.",409);
 return rows.map(row=>({...row,active:locked.find(r=>r.id===row.resource_id)!.active}));
}
export async function changeFulfillment(actor:Actor,id:string,input:unknown){
 const command=fulfillmentCommand.parse(input),hash=digest(command);
 try{return await transaction(async c=>{
  const ctx=await context(c,actor,id,true),ownerAction=command.action==="ACK_INSPECTION";
  if(ownerAction?!ctx.owner:!ctx.operator)throw new DomainError(ownerAction?"Only the renter may accept or dispute an inspection.":"Only an independent agency operator may record fulfillment.",403);
  await lockAuthority(c,ctx,!ownerAction);
  const old=(await c.query("SELECT digest FROM booking_fulfillment_command WHERE request_id=$1 AND actor_id=$2 AND idempotency_key=$3",[id,ctx.user.id,command.idempotencyKey])).rows[0];if(old){if(old.digest!==hash)throw new DomainError("This retry key belongs to a different fulfillment action.",409);return projection(c,ctx);}
  await assertFinancialOpen(c,id);version(ctx,command.version);const {a,line,policy}=await exactLine(c,ctx,command.lineId),now=(await c.query<{now:Date}>("SELECT clock_timestamp() AS now")).rows[0].now,s=await lineState(c,ctx,a,line,now);
  if(command.action==="RECORD_INSPECTION"){
   if(!(command.phase==="PRE"?s.canInspectPre:s.canInspectPost))throw new DomainError("An inspection cannot be recorded at this service stage.",409);
   if(command.phase==="PRE"&&(!command.condition.roadworthy||!command.condition.safetyChecked))throw new DomainError("Resolve safety issues before preparing a release inspection.",422);
   if(command.phase==="POST"&&s.pre&&command.condition.odometerKm<s.pre.body.odometerKm)throw new DomainError("Return mileage cannot be lower than the release inspection.",422);
   const photos=(await c.query("SELECT id FROM booking_inspection_file WHERE id=ANY($1::uuid[]) AND request_id=$2 AND quote_id=$3 AND line_id=$4 AND phase=$5",[command.condition.photoIds,id,a.q.id,line.lineId,command.phase])).rows;
   if(photos.length!==command.condition.photoIds.length)throw new DomainError("Choose photos uploaded for this exact service and inspection phase.",409);
   const revision=Number((await c.query("SELECT COALESCE(max(revision),0)+1 n FROM booking_inspection WHERE quote_id=$1 AND line_id=$2 AND phase=$3",[a.q.id,line.lineId,command.phase])).rows[0].n),inspectionId=randomUUID(),createdAt=now.toISOString();
   const reportDigest=digest({id:inspectionId,quoteId:a.q.id,lineId:line.lineId,phase:command.phase,revision,createdAt,body:command.condition});
   await c.query("INSERT INTO booking_inspection(id,request_id,quote_id,line_id,phase,revision,body,digest,actor_id,created_at)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",[inspectionId,id,a.q.id,line.lineId,command.phase,revision,command.condition,reportDigest,ctx.user.id,now]);
   for(const photo of photos)await c.query("INSERT INTO booking_inspection_photo(inspection_id,request_id,quote_id,line_id,phase,file_id)VALUES($1,$2,$3,$4,$5,$6)",[inspectionId,id,a.q.id,line.lineId,command.phase,photo.id]);
   if(command.phase==="POST"&&s.stage==="RENTAL_ACTIVE"){
    await resourceRows(c,ctx,a.q.id,line.lineId);
    await c.query("UPDATE booking_actual_occupation SET closed_at=clock_timestamp(),available_at=clock_timestamp()+$3::int*interval '1 minute' WHERE quote_id=$1 AND line_id=$2 AND closed_at IS NULL",[a.q.id,line.lineId,Number(policy.bufferMinutes)]);
    await event(c,ctx,a.q.id,line.lineId,"RECORD_RETURN",{inspectionId,note:"Actual return recorded. Condition acceptance and financial reconciliation remain separate."});
   }
  }else if(command.action==="ACK_INSPECTION"){
   const r=[s.pre,s.post].find(v=>v?.id===command.inspectionId);if(!r||r.digest!==command.digest||r.decision||(r.phase==="PRE"&&!s.canAcknowledgePre)||(r.phase==="POST"&&!s.canAcknowledgePost))throw new DomainError("Review the exact current inspection before responding.",409);
   await c.query("INSERT INTO booking_inspection_ack(id,inspection_id,request_id,actor_id,decision,reason)VALUES($1,$2,$3,$4,$5,$6)",[randomUUID(),r.id,id,ctx.user.id,command.decision,command.reason]);
  }else if(command.action==="RELEASE_RENTAL"){
   if(!s.canRelease||s.pre?.id!==command.inspectionId||s.pre.digest!==command.digest)throw new DomainError("Release requires the current accepted inspection, valid documents and scheduled pickup time.",409);
   const resources=await resourceRows(c,ctx,a.q.id,line.lineId);
   if(resources.some(r=>!r.active))throw new DomainError("An assigned resource is inactive.",409);
   const vehicle=(await c.query("SELECT v.owner_actor_id,o.state FROM physical_vehicle v JOIN vehicle_offer o ON o.vehicle_id=v.id WHERE v.id=ANY($1::uuid[]) AND o.agency_id=$2",[resources.map(r=>r.resource_id),ctx.r.agency_id])).rows[0];
   if(!vehicle||vehicle.state!=="PUBLISHED")throw new DomainError("Vehicle compliance is no longer current.",409);
   // Resource locks serialize actual handovers; no second request is locked here.
   if((await c.query("SELECT 1 FROM booking_actual_occupation WHERE resource_id=ANY($1::uuid[]) AND (closed_at IS NULL OR available_at>clock_timestamp()) LIMIT 1",[resources.map(r=>r.resource_id)])).rowCount)throw new DomainError("An assigned vehicle or driver is still out or in its return turnaround period.",409);
   if((await c.query("SELECT 1 FROM booking_actual_occupation WHERE resource_id=ANY($1::uuid[]) AND closed_at IS NOT NULL AND booking_return_safety_hold(quote_id,line_id) LIMIT 1",[resources.filter(r=>r.kind==="VEHICLE").map(r=>r.resource_id)])).rowCount)throw new DomainError("Resolve the vehicle's documented return safety issue before another handover.",409);
   if((await c.query("SELECT 1 FROM agency_driver WHERE id=ANY($1::uuid[]) AND (NOT active OR license_expiry<GREATEST((($2::timestamptz-interval '1 microsecond') AT TIME ZONE 'Asia/Manila')::date,(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date))",[resources.map(r=>r.resource_id),line.endAt])).rowCount)throw new DomainError("Assigned driver license is no longer valid.",409);
   if(!await requirementsValid(c,id,line))throw new DomainError("Renter requirements are no longer current.",409);
   for(const r of resources){const inserted=await c.query("INSERT INTO booking_actual_occupation(id,resource_id,request_id,quote_id,line_id,planned_end)SELECT $1,$2,$3,$4,$5,$6 WHERE clock_timestamp()>=$7 AND clock_timestamp()<$6 RETURNING id",[randomUUID(),r.resource_id,id,a.q.id,line.lineId,line.endAt,line.startAt]);if(!inserted.rowCount)throw new DomainError("The scheduled release window ended. Reload before continuing.",409);}
   await event(c,ctx,a.q.id,line.lineId,"RELEASE_RENTAL",{inspectionId:s.pre.id,note:"Vehicle handed over; actual resource occupancy remains active until recorded return."});
  }else if(command.action==="START_TOUR"){
   if(!s.canStartTour||command.attendance>line.partySize)throw new DomainError("Tour start requires scheduled time, valid requirements and attendance within the booked party.",409);
   const holds=(await c.query("SELECT s.id,s.cancelled_at FROM booking_hold_seat h JOIN tour_schedule s ON s.id=h.schedule_id WHERE h.quote_id=$1 AND h.line_id=$2 FOR UPDATE OF s",[a.q.id,line.lineId])).rows;
   if(holds.length!==1||holds[0].cancelled_at)throw new DomainError("The allocated departure is unavailable.",409);
   const startNow=(await c.query("SELECT clock_timestamp()>=$1::timestamptz AND clock_timestamp()<$2::timestamptz AS valid",[line.startAt,line.endAt])).rows[0].valid;if(!startNow)throw new DomainError("The departure start window ended.",409);
   await event(c,ctx,a.q.id,line.lineId,"START_TOUR",{attendance:command.attendance,note:command.note});
  }else{
   if(!s.canCompleteTour)throw new DomainError("Start this tour before recording completion.",409);await event(c,ctx,a.q.id,line.lineId,"COMPLETE_TOUR",{note:command.note});
  }
  await c.query("INSERT INTO booking_fulfillment_command(id,request_id,actor_id,idempotency_key,digest)VALUES($1,$2,$3,$4,$5)",[randomUUID(),id,ctx.user.id,command.idempotencyKey,hash]);
  await refreshStatus(c,ctx,a);await note(c,ctx,command.action,`${a.environment==="DEMO"?"Demo booking — no money moves. ":""}${command.action.replaceAll("_"," ").toLowerCase()} recorded for ${line.title}. Financial reconciliation remains separate.`);return projection(c,ctx);
 });}catch(e){if((e as {code?:string}).code==="23505")throw new DomainError("This fulfillment action was already recorded. Reload before continuing.",409);throw e;}
}
async function photoContext(c:PoolClient,actor:Actor,id:string,lineId:string,phase:string,n:number){
 const ctx=await context(c,actor,id,true);if(!ctx.operator)throw new DomainError("Only agency operators may upload inspection evidence.",403);await lockAuthority(c,ctx,true);await assertFinancialOpen(c,id);version(ctx,versionSchema.parse(n));
 const p=inspectionPhase.parse(phase),{a,line}=await exactLine(c,ctx,uuid.parse(lineId)),now=(await c.query<{now:Date}>("SELECT clock_timestamp() AS now")).rows[0].now,s=await lineState(c,ctx,a,line,now);
 if(!(p==="PRE"?s.canInspectPre:s.canInspectPost))throw new DomainError("Inspection uploads are unavailable at this stage.",409);
 if(Number((await c.query("SELECT count(*) FROM booking_inspection_file WHERE request_id=$1 AND line_id=$2",[id,lineId])).rows[0].count)>=30)throw new DomainError("This service reached its 30-photo evidence limit.",409);return {ctx,a,phase:p};
}
export async function authorizeInspectionUpload(actor:Actor,id:string,lineId:string,phase:string,n:number){return transaction(async c=>{await photoContext(c,actor,id,lineId,phase,n);});}
export async function attachInspectionPhoto(actor:Actor,id:string,lineId:string,phase:string,n:number,file:{id:string;mime:string;size:number;sha256:string;backend:string}){
 uuid.parse(file.id);if(!["image/png","image/jpeg"].includes(file.mime)||!Number.isInteger(file.size)||file.size<1||file.size>5242880||!/^([a-f0-9]{64})$/.test(file.sha256)||!["s3","local"].includes(file.backend))throw new DomainError("Invalid inspection evidence.",422);
 return transaction(async c=>{const v=await photoContext(c,actor,id,lineId,phase,n);await c.query("INSERT INTO booking_inspection_file(id,request_id,quote_id,line_id,phase,uploader_id,mime,size_bytes,sha256,backend)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",[file.id,id,v.a.q.id,lineId,v.phase,v.ctx.user.id,file.mime,file.size,file.sha256,file.backend]);await c.query("UPDATE booking_request SET version=version+1 WHERE id=$1",[id]);v.ctx.r.version++;await audit(c,v.ctx.user,"INSPECTION_PHOTO_UPLOADED",id,{fileId:file.id});return projection(c,v.ctx);});
}
export async function inspectionPhotoForRead(actor:Actor,id:string){return transaction(async c=>{await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");const f=(await c.query("SELECT request_id,mime,backend,EXISTS(SELECT 1 FROM booking_inspection_photo p WHERE p.file_id=f.id) AS published FROM booking_inspection_file f WHERE f.id=$1",[uuid.parse(id)])).rows[0];if(!f)throw new DomainError("Photo not found.",404);const ctx=await context(c,actor,f.request_id);if(ctx.owner&&!f.published)throw new DomainError("Photo not found.",404);return {objectKey:`${f.request_id}/${id}`,mime:f.mime as string,backend:f.backend as string,name:`inspection-${id}.${f.mime==="image/png"?"png":"jpg"}`};});}
export async function getInspectionById(actor:Actor,id:string){return transaction(async c=>{
 await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");const saved=(await c.query("SELECT request_id,quote_id,line_id,phase FROM booking_inspection WHERE id=$1",[uuid.parse(id)])).rows[0];if(!saved)throw new DomainError("Inspection not found.",404);
 const ctx=await context(c,actor,saved.request_id),inspection=await report(c,saved.quote_id,saved.line_id,saved.phase,id);if(!inspection)throw new DomainError("Inspection not found.",404);
 const account=(await c.query("SELECT environment FROM booking_payment_account WHERE quote_id=$1",[saved.quote_id])).rows[0];return {requestId:ctx.r.id as string,agencyId:ctx.r.agency_id as string,isOwner:ctx.owner,environment:account?.environment as string|undefined,inspection};
});}
