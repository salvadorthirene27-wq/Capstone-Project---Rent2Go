import {randomUUID} from "node:crypto";
import type {PoolClient} from "pg";
import {transaction} from "../../lib/db";
import {uuid} from "../../lib/http";
import {storedActor,audit} from "../partners/service";
import {DomainError,type Actor} from "../partners/workflow";
import {digest} from "../cart/pricing";
import {lockBookingAuthority} from "./quotation";
import {normalizePaymentReference} from "./payment-schema";
import {refundCommand,refundListQuery,refundStage,refundCapacity,refundableStatus} from "./refund-schema";
type RefundCommand=ReturnType<typeof refundCommand.parse>;
export type RefundEvidence={id:string;mime:string;size:number;sha256:string;backend:string};
async function context(c:PoolClient,actor:Actor,id:string,lock=false){
 const r=(await c.query(`SELECT id,agency_id,renter_id,status,version FROM booking_request WHERE id=$1${lock?" FOR UPDATE":""}`,[uuid.parse(id)])).rows[0],user=await storedActor(actor,c);
 if(!r)throw new DomainError("Request not found.",404);
 if((await c.query("SELECT is_test_fixture FROM app_actor WHERE id=$1",[user.id])).rows[0]?.is_test_fixture)throw new DomainError("Access denied.",403);
 const owner=r.renter_id===user.id,operator=!owner&&Boolean((await c.query("SELECT 1 FROM agency a JOIN app_actor o ON o.id=a.owner_id LEFT JOIN agency_member m ON m.agency_id=a.id AND m.actor_id=$2 WHERE a.id=$1 AND a.active AND NOT o.suspended AND NOT o.is_test_fixture AND (a.owner_id=$2 OR m.active)",[r.agency_id,user.id])).rowCount);
 if(!owner&&!operator)throw new DomainError("Request not found.",404);return {r,user,owner,operator};
}
type Context=Awaited<ReturnType<typeof context>>;
const rowSql=`SELECT r.*,d.decision,d.reason AS decision_reason,d.created_at AS decided_at,x.action AS cancellation,x.reason AS cancellation_reason,x.created_at AS cancelled_at,p.id AS payment_id,p.recorded_at AS paid_at,
 (SELECT t.id FROM booking_refund_attempt t WHERE t.refund_id=r.id AND t.initial_outcome='PENDING' AND NOT EXISTS(SELECT 1 FROM booking_refund_resolution z WHERE z.attempt_id=t.id) ORDER BY t.created_at DESC,t.id DESC LIMIT 1) AS pending_attempt_id
 FROM booking_refund_request r LEFT JOIN booking_refund_decision d ON d.refund_id=r.id LEFT JOIN booking_refund_cancel x ON x.refund_id=r.id LEFT JOIN booking_refund_payment p ON p.refund_id=r.id`;
const openSql="payment_id IS NULL AND cancellation IS NULL AND (decision IS NULL OR decision='APPROVE')";
async function capacity(c:PoolClient,collectionId:string){
 const row=(await c.query(`SELECT k.amount_centavos::text AS confirmed,
 COALESCE((SELECT sum(r.amount_centavos) FROM booking_refund_request r JOIN booking_refund_decision d ON d.refund_id=r.id AND d.decision='APPROVE' WHERE r.collection_id=k.id AND NOT EXISTS(SELECT 1 FROM booking_refund_cancel x WHERE x.refund_id=r.id) AND NOT EXISTS(SELECT 1 FROM booking_refund_payment p WHERE p.refund_id=r.id)),0)::text AS reserved,
 COALESCE((SELECT sum(p.amount_centavos) FROM booking_refund_payment p JOIN booking_refund_request r ON r.id=p.refund_id WHERE r.collection_id=k.id),0)::text AS paid
 FROM booking_payment_collection k WHERE k.id=$1`,[collectionId])).rows[0];if(!row)throw new DomainError("Collection not found.",404);return refundCapacity(Number(row.confirmed),Number(row.reserved),Number(row.paid));
}
async function view(c:PoolClient,ctx:Context,r:any){
 const stage=refundStage(r.decision,r.cancellation,Boolean(r.payment_id),Boolean(r.pending_attempt_id)),eligible=refundableStatus(ctx.r.status),approved=["APPROVED","DEMO_PENDING"].includes(stage);
 const attempts=(await c.query("SELECT t.id,t.method,t.reference,t.initial_outcome,t.note,t.created_at,t.file_id,z.outcome FROM booking_refund_attempt t LEFT JOIN booking_refund_resolution z ON z.attempt_id=t.id WHERE t.refund_id=$1 ORDER BY t.created_at DESC,t.id DESC LIMIT 10",[r.id])).rows;
 return {id:r.id as string,collectionId:r.collection_id as string,environment:r.environment as "MANUAL"|"DEMO",amountCentavos:Number(r.amount_centavos),reason:r.reason as string,digest:r.digest as string,createdAt:(r.created_at as Date).toISOString(),policies:r.policy_snapshot as {quoteId:string;quoteDigest:string;services:{title:string;cancellationPolicy:string;refundPolicy:string;damagePolicy:string}[]},stage,decisionReason:r.decision_reason as string|null,cancellationReason:r.cancellation_reason as string|null,paymentId:r.payment_id as string|null,paidAt:r.paid_at?(r.paid_at as Date).toISOString():null,pendingAttemptId:r.pending_attempt_id as string|null,
 canReview:ctx.operator&&eligible&&stage==="PENDING_REVIEW",canWithdraw:ctx.owner&&stage==="PENDING_REVIEW",canRevoke:ctx.operator&&approved,canRecordManual:ctx.operator&&eligible&&stage==="APPROVED"&&r.environment==="MANUAL",canSimulate:ctx.operator&&eligible&&stage==="APPROVED"&&r.environment==="DEMO",canResolveDemo:ctx.operator&&eligible&&stage==="DEMO_PENDING"&&r.environment==="DEMO",
 attempts:attempts.map(t=>({id:t.id as string,method:t.method as string,reference:t.reference as string,outcome:(t.outcome??t.initial_outcome) as string,note:t.note as string,createdAt:(t.created_at as Date).toISOString(),evidenceId:t.file_id as string|null}))};
}
async function projection(c:PoolClient,ctx:Context,input:unknown={}){
 const pages=refundListQuery.parse(input),id=ctx.r.id;
 const sourceRows=(await c.query("SELECT id,environment,method,reference,amount_centavos,recorded_at,count(*) OVER()::int AS total FROM booking_payment_collection WHERE request_id=$1 ORDER BY recorded_at DESC,id DESC LIMIT 20 OFFSET $2",[id,(pages.sourcePage-1)*20])).rows,sources=[];
 for(const k of sourceRows)sources.push({id:k.id as string,environment:k.environment as "MANUAL"|"DEMO",method:k.method as string,reference:k.reference as string,recordedAt:(k.recorded_at as Date).toISOString(),capacity:await capacity(c,k.id)});
 const sourceCount=Number(sourceRows[0]?.total??(await c.query("SELECT count(*) n FROM booking_payment_collection WHERE request_id=$1",[id])).rows[0].n);
 const activeRows=(await c.query(`SELECT * FROM (${rowSql} WHERE r.request_id=$1) v WHERE ${openSql} ORDER BY created_at,id LIMIT 20`,[id])).rows,open=[];for(const r of activeRows)open.push(await view(c,ctx,r));
 const historyRows=(await c.query(`SELECT *,count(*) OVER()::int AS total FROM (${rowSql} WHERE r.request_id=$1) v WHERE NOT (${openSql}) ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $2`,[id,(pages.historyPage-1)*20])).rows,history=[];for(const r of historyRows)history.push(await view(c,ctx,r));
 const historyCount=Number(historyRows[0]?.total??(await c.query(`SELECT count(*) n FROM (${rowSql} WHERE r.request_id=$1) v WHERE NOT (${openSql})`,[id])).rows[0].n);
 return {requestId:id as string,requestVersion:ctx.r.version as number,status:ctx.r.status as string,isOwner:ctx.owner,isOperator:ctx.operator,canRequest:ctx.owner&&refundableStatus(ctx.r.status)&&open.length<20&&sourceCount>0,sources,sourcePage:pages.sourcePage,sourcePages:Math.max(1,Math.ceil(sourceCount/20)),open,history,historyPage:pages.historyPage,historyPages:Math.max(1,Math.ceil(historyCount/20))};
}
export async function getRefunds(actor:Actor,id:string,input:unknown={}){return transaction(async c=>{await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");return projection(c,await context(c,actor,id),input);});}
type RefundState=Awaited<ReturnType<typeof getRefunds>>;
async function authorize(c:PoolClient,actor:Actor,id:string,command:RefundCommand,fileHash?:string){
 const ctx=await context(c,actor,id,true),operator=!["REQUEST_REFUND","WITHDRAW_REFUND"].includes(command.action);
 if(operator?!ctx.operator:!ctx.owner)throw new DomainError(operator?"Only an independent agency operator may review or execute refunds.":"Only the renter may request or withdraw a refund.",403);
 await lockBookingAuthority(c,ctx,[ctx.r.renter_id],operator);const hash=digest({command,...(fileHash?{fileHash}:{})}),old=(await c.query("SELECT digest FROM booking_refund_command WHERE request_id=$1 AND actor_id=$2 AND idempotency_key=$3",[id,ctx.user.id,command.idempotencyKey])).rows[0];
 if(old){if(old.digest!==hash)throw new DomainError("This retry key belongs to another refund action.",409);return {ctx,hash,replayed:true as const};}
 if(ctx.r.version!==command.version)throw new DomainError("This request changed. Reload refunds before continuing.",409);return {ctx,hash,replayed:false as const};
}
async function exact(c:PoolClient,ctx:Context,command:Extract<RefundCommand,{refundId:string}>){
 const r=(await c.query(`${rowSql} WHERE r.id=$1 AND r.request_id=$2`,[command.refundId,ctx.r.id])).rows[0];if(!r)throw new DomainError("Refund request not found.",404);if(r.digest!==command.digest)throw new DomainError("Review the exact refund request and saved policies.",409);return {r,record:await view(c,ctx,r)};
}
function evidence(file:RefundEvidence){uuid.parse(file.id);if(!["image/png","image/jpeg","application/pdf"].includes(file.mime)||!Number.isInteger(file.size)||file.size<1||file.size>5242880||!/^([a-f0-9]{64})$/.test(file.sha256)||!["s3","local"].includes(file.backend))throw new DomainError("Invalid private refund evidence.",422);}
async function manualGate(c:PoolClient,ctx:Context,command:RefundCommand){
 if(command.action!=="RECORD_MANUAL_REFUND")throw new DomainError("Choose a manual refund evidence command.",422);const result=await exact(c,ctx,command);if(!result.record.canRecordManual)throw new DomainError("Only an approved manual refund may receive private execution evidence.",409);return result;
}
export async function authorizeRefundEvidence(actor:Actor,id:string,input:unknown,fileHash:string){
 const command=refundCommand.parse(input);if(command.action!=="RECORD_MANUAL_REFUND"||!/^([a-f0-9]{64})$/.test(fileHash))throw new DomainError("Invalid refund evidence command.",422);
 return transaction(async c=>{const v=await authorize(c,actor,id,command,fileHash);if(v.replayed)return {alreadyApplied:true as const,state:await projection(c,v.ctx)};await manualGate(c,v.ctx,command);return {alreadyApplied:false as const};});
}
async function event(c:PoolClient,ctx:Context,action:string,refundId:string,environment:string){
 const message=`${environment==="DEMO"?"Demo refund — no money moves. ":""}${action.replaceAll("_"," ").toLowerCase()} recorded. Refund review, payment and final financial reconciliation remain separate.`;
 await c.query("UPDATE booking_request SET version=version+1 WHERE id=$1",[ctx.r.id]);ctx.r.version++;
 await c.query("INSERT INTO booking_event(id,request_id,actor_id,action,message)VALUES($1,$2,$3,$4,$5)",[randomUUID(),ctx.r.id,ctx.user.id,action,message]);await audit(c,ctx.user,action,ctx.r.id,{refundId});
 await c.query("INSERT INTO booking_notification(id,request_id,recipient_id,message)SELECT gen_random_uuid(),$1,a.id,$2 FROM app_actor a WHERE NOT a.suspended AND (a.id=$3 OR a.id IN(SELECT actor_id FROM agency_member WHERE agency_id=$4 AND active) OR a.id IN(SELECT owner_id FROM agency WHERE id=$4))",[ctx.r.id,message,ctx.r.renter_id,ctx.r.agency_id]);
}
async function payment(c:PoolClient,ctx:Context,r:any,attemptId:string){await c.query("INSERT INTO booking_refund_payment(id,refund_id,attempt_id,request_id,environment,amount_centavos,recorded_by)VALUES($1,$2,$3,$4,$5,$6,$7)",[randomUUID(),r.id,attemptId,ctx.r.id,r.environment,r.amount_centavos,ctx.user.id]);}
async function run(actor:Actor,id:string,command:RefundCommand,file?:RefundEvidence):Promise<{state:RefundState;usedFile:boolean}>{
 try{return await transaction(async c=>{
  const v=await authorize(c,actor,id,command,file?.sha256),{ctx}=v;if(v.replayed)return {state:await projection(c,ctx),usedFile:false};const commandId=randomUUID();
  await c.query("INSERT INTO booking_refund_command(id,request_id,actor_id,idempotency_key,digest,action)VALUES($1,$2,$3,$4,$5,$6)",[commandId,id,ctx.user.id,command.idempotencyKey,v.hash,command.action]);let refundId:string,environment:string;
  if(command.action==="REQUEST_REFUND"){
   if(!refundableStatus(ctx.r.status))throw new DomainError("Refund requests require cancelled, physically finished or historical payment reconciliation. Active service disputes follow separate review.",409);
   if(Number((await c.query(`SELECT count(*) n FROM (${rowSql} WHERE r.request_id=$1) v WHERE ${openSql}`,[id])).rows[0].n)>=20)throw new DomainError("Resolve existing refund requests before opening more than20 at once.",409);
   const k=(await c.query("SELECT k.*,q.digest AS quote_digest,q.public_snapshot FROM booking_payment_collection k JOIN booking_quotation q ON q.id=k.quote_id WHERE k.id=$1 AND k.request_id=$2",[command.collectionId,id])).rows[0];if(!k)throw new DomainError("Collection not found.",404);
   if(command.amountCentavos>(await capacity(c,k.id)).availableCentavos)throw new DomainError("The requested amount exceeds the unreserved, unrefunded source collection.",409);
   refundId=randomUUID();environment=k.environment;const policy={quoteId:k.quote_id,quoteDigest:k.quote_digest,services:k.public_snapshot.lines.map((l:any)=>{const p=k.public_snapshot.policies?.find((p:any)=>p.lineId===l.lineId);return {title:l.title,cancellationPolicy:p?.cancellationPolicy??"",refundPolicy:p?.refundPolicy??"",damagePolicy:p?.damagePolicy??""};})},now=(await c.query("SELECT clock_timestamp() now")).rows[0].now as Date;
   const hash=digest({id:refundId,requestId:id,collectionId:k.id,environment,amountCentavos:command.amountCentavos,reason:command.reason,createdAt:now.toISOString(),policies:policy});
   await c.query("INSERT INTO booking_refund_request(id,request_id,collection_id,quote_id,agency_id,environment,actor_id,amount_centavos,reason,policy_snapshot,digest,created_at)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",[refundId,id,k.id,k.quote_id,ctx.r.agency_id,environment,ctx.user.id,command.amountCentavos,command.reason,policy,hash,now]);
  }else{
   const {r,record}=await exact(c,ctx,command);refundId=r.id;environment=r.environment;
   if(command.action==="REVIEW_REFUND"){
    if(!record.canReview)throw new DomainError("Only a pending refund may be independently reviewed.",409);
    if(command.decision==="APPROVE"&&Number(r.amount_centavos)>(await capacity(c,r.collection_id)).availableCentavos)throw new DomainError("Other approved refunds reserved this source balance. Reject or request a corrected amount.",409);
    await c.query("INSERT INTO booking_refund_decision(id,refund_id,request_id,actor_id,decision,reason)VALUES($1,$2,$3,$4,$5,$6)",[randomUUID(),r.id,id,ctx.user.id,command.decision,command.reason]);
   }else if(command.action==="WITHDRAW_REFUND"||command.action==="REVOKE_REFUND"){
    if(!(command.action==="WITHDRAW_REFUND"?record.canWithdraw:record.canRevoke))throw new DomainError("Only a pending request may be withdrawn or an unpaid approval revoked. Paid refunds remain immutable.",409);
    await c.query("INSERT INTO booking_refund_cancel(id,refund_id,request_id,actor_id,action,reason)VALUES($1,$2,$3,$4,$5,$6)",[randomUUID(),r.id,id,ctx.user.id,command.action==="WITHDRAW_REFUND"?"WITHDRAW":"REVOKE",command.reason]);
   }else if(command.action==="RECORD_MANUAL_REFUND"){
    if(!file)throw new DomainError("Upload private proof for an externally executed manual refund.",415);await manualGate(c,ctx,command);const attemptId=randomUUID(),reference=normalizePaymentReference(command.reference);
    await c.query("INSERT INTO booking_refund_attempt(id,refund_id,request_id,environment,actor_id,command_id,method,reference,normalized_reference,initial_outcome,note,file_id,mime,size_bytes,sha256,backend)VALUES($1,$2,$3,'MANUAL',$4,$5,$6,$7,$8,'CONFIRMED',$9,$10,$11,$12,$13,$14)",[attemptId,r.id,id,ctx.user.id,commandId,command.method,command.reference,reference,command.note,file.id,file.mime,file.size,file.sha256,file.backend]);
    await c.query("INSERT INTO booking_refund_reference(agency_id,method,normalized_reference,attempt_id)VALUES($1,$2,$3,$4)",[ctx.r.agency_id,command.method,reference,attemptId]);await payment(c,ctx,r,attemptId);
   }else if(command.action==="SIMULATE_REFUND"){
    if(!record.canSimulate)throw new DomainError("Only an approved demo refund without a pending result may be simulated.",409);if(Number((await c.query("SELECT count(*) n FROM booking_refund_attempt WHERE refund_id=$1",[r.id])).rows[0].n)>=30)throw new DomainError("This refund reached its30-attempt limit. Review or revoke the unpaid authorization.",409);
    const source=(await c.query("SELECT method FROM booking_payment_collection WHERE id=$1",[r.collection_id])).rows[0],attemptId=randomUUID(),reference=`DEMO-REFUND-${randomUUID()}`,outcome=command.outcome==="APPROVED"?"CONFIRMED":command.outcome;
    await c.query("INSERT INTO booking_refund_attempt(id,refund_id,request_id,environment,actor_id,command_id,method,reference,normalized_reference,initial_outcome,note)VALUES($1,$2,$3,'DEMO',$4,$5,$6,$7,$7,$8,'Demo refund — no money moves')",[attemptId,r.id,id,ctx.user.id,commandId,source.method,reference,outcome]);if(outcome==="CONFIRMED")await payment(c,ctx,r,attemptId);
   }else{
    if(!record.canResolveDemo||record.pendingAttemptId!==command.attemptId)throw new DomainError("Resolve only the exact pending result on this approved demo refund.",409);const outcome=command.outcome==="APPROVED"?"CONFIRMED":command.outcome;
    await c.query("INSERT INTO booking_refund_resolution(id,attempt_id,refund_id,request_id,environment,actor_id,command_id,outcome)VALUES($1,$2,$3,$4,'DEMO',$5,$6,$7)",[randomUUID(),command.attemptId,r.id,id,ctx.user.id,commandId,outcome]);if(outcome==="CONFIRMED")await payment(c,ctx,r,command.attemptId);
   }
  }
  await event(c,ctx,command.action,refundId,environment);return {state:await projection(c,ctx),usedFile:Boolean(file&&command.action==="RECORD_MANUAL_REFUND")};
 });}catch(e){if((e as {code?:string}).code==="23505")throw new DomainError("This refund or outgoing reference is already recorded. Reload before retrying.",409);throw e;}
}
export async function changeRefund(actor:Actor,id:string,input:unknown){const command=refundCommand.parse(input);if(command.action==="RECORD_MANUAL_REFUND")throw new DomainError("Upload private proof for an externally executed manual refund.",415);return (await run(actor,id,command)).state;}
export async function attachRefundEvidence(actor:Actor,id:string,input:unknown,file:RefundEvidence){const command=refundCommand.parse(input);if(command.action!=="RECORD_MANUAL_REFUND")throw new DomainError("Choose a manual refund evidence command.",422);evidence(file);return run(actor,id,command,file);}
export async function refundEvidenceForRead(actor:Actor,id:string){return transaction(async c=>{
 await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");const f=(await c.query("SELECT t.request_id,t.file_id,t.mime,t.backend FROM booking_refund_attempt t JOIN booking_refund_payment p ON p.attempt_id=t.id WHERE t.file_id=$1",[uuid.parse(id)])).rows[0];if(!f)throw new DomainError("Refund evidence not found.",404);await context(c,actor,f.request_id);return {objectKey:`${f.request_id}/${f.file_id}`,mime:f.mime as string,backend:f.backend as string,name:`refund-${f.file_id}.${f.mime==="image/png"?"png":f.mime==="image/jpeg"?"jpg":"pdf"}`};
});}
export async function getRefundReceipt(actor:Actor,id:string){return transaction(async c=>{
 await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");const p=(await c.query("SELECT p.id,p.request_id,p.environment,p.amount_centavos,p.recorded_at,r.agency_id,r.reason,r.policy_snapshot,t.method,t.reference,t.file_id,k.id AS collection_id,k.reference AS collection_reference,k.agency_name,k.renter_name FROM booking_refund_payment p JOIN booking_refund_request r ON r.id=p.refund_id JOIN booking_refund_attempt t ON t.id=p.attempt_id JOIN booking_payment_collection k ON k.id=r.collection_id WHERE p.id=$1",[uuid.parse(id)])).rows[0];if(!p)throw new DomainError("Refund payment record not found.",404);const ctx=await context(c,actor,p.request_id);
 return {requestId:p.request_id as string,agencyId:p.agency_id as string,isOwner:ctx.owner,receipt:{id:p.id as string,environment:p.environment as "MANUAL"|"DEMO",amountCentavos:Number(p.amount_centavos),recordedAt:(p.recorded_at as Date).toISOString(),method:p.method as string,reference:p.reference as string,evidenceId:p.file_id as string|null,collectionId:p.collection_id as string,collectionReference:p.collection_reference as string,agencyName:p.agency_name as string,renterName:p.renter_name as string,reason:p.reason as string}};
});}
