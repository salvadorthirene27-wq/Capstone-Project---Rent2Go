import {assertGatewaySourceReplaceable} from '../gateway/booking-guard';
import {assertNoPendingCancellation,cancellationPending} from "./cancellation-guard";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { transaction } from "../../lib/db";
import { uuid } from "../../lib/http";
import { storedActor, audit } from "../partners/service";
import { DomainError, type Actor } from "../partners/workflow";
import { lockBookingAuthority } from "./quotation";
import { agreementCommand, signatureCommand, agreementBody, agreementDigest, validateSignerName, AGREEMENT_TEMPLATE_VERSION, type AgreementBody } from "./agreement-schema";

type RequestRow={id:string;agency_id:string;renter_id:string;agency_name:string;status:string;version:number;contact:{name:string;phone:string;email:string;notes:string}};
type AgreementRow={id:string;request_id:string;quote_id:string;revision:number;digest:string;quote_digest:string;issued_at:Date;expires_at:Date;template_version:string;body:AgreementBody;withdrawn:boolean;elapsed:boolean;released_at:Date|null;signature_id:string|null;signer_name:string|null;signed_at:Date|null};
async function context(c:PoolClient,actor:Actor,id:string,lock=false){
 const r=(await c.query<RequestRow>(`SELECT * FROM booking_request WHERE id=$1${lock?" FOR UPDATE":""}`,[uuid.parse(id)])).rows[0];
 const user=await storedActor(actor,c);
 if((await c.query("SELECT is_test_fixture FROM app_actor WHERE id=$1",[user.id])).rows[0]?.is_test_fixture)throw new DomainError("Access denied.",403);
 if(!r)throw new DomainError("Request not found.",404);
 const owner=r.renter_id===user.id;
 const agencyActive=Boolean((await c.query("SELECT 1 FROM agency a JOIN app_actor o ON o.id=a.owner_id WHERE a.id=$1 AND a.active AND NOT o.suspended AND NOT o.is_test_fixture",[r.agency_id])).rowCount);
 const operator=!owner&&Boolean((await c.query("SELECT 1 FROM agency a JOIN app_actor o ON o.id=a.owner_id LEFT JOIN agency_member m ON m.agency_id=a.id AND m.actor_id=$2 WHERE a.id=$1 AND a.active AND NOT o.suspended AND NOT o.is_test_fixture AND (a.owner_id=$2 OR m.active)",[r.agency_id,user.id])).rowCount);
 if(!owner&&!operator)throw new DomainError("Request not found.",404);
 return {r,user,owner,operator,agencyActive};
}
type Context=Awaited<ReturnType<typeof context>>;
async function currentQuote(c:PoolClient,id:string){
 return (await c.query("SELECT q.*,EXISTS(SELECT 1 FROM booking_quotation_decision d WHERE d.quote_id=q.id AND d.action='ACCEPTED') AS accepted,h.released_at,EXISTS(SELECT 1 FROM booking_hold_commitment k WHERE k.hold_id=h.id) AND h.released_at IS NULL AS committed,(h.expires_at>clock_timestamp() OR EXISTS(SELECT 1 FROM booking_hold_commitment k WHERE k.hold_id=h.id)) AND h.released_at IS NULL AS live FROM booking_quotation q JOIN booking_hold h ON h.quote_id=q.id WHERE q.request_id=$1 ORDER BY q.revision DESC LIMIT 1",[id])).rows[0];
}
async function agreementRow(c:PoolClient,id:string,agreementId?:string){
 return (await c.query<AgreementRow>(`SELECT a.id,a.request_id,a.quote_id,a.revision,a.digest,a.quote_digest,a.issued_at,a.expires_at,a.template_version,a.body,EXISTS(SELECT 1 FROM booking_agreement_event e WHERE e.agreement_id=a.id AND e.action='WITHDRAWN') AS withdrawn,a.expires_at<=clock_timestamp() AS elapsed,h.released_at,s.id AS signature_id,s.signer_name,s.signed_at FROM booking_agreement a JOIN booking_hold h ON h.quote_id=a.quote_id LEFT JOIN booking_agreement_signature s ON s.agreement_id=a.id WHERE a.request_id=$1 ${agreementId?"AND a.id=$2":""} ORDER BY a.revision DESC LIMIT 1`,agreementId?[id,agreementId]:[id])).rows[0];
}
function agreementView(a:AgreementRow){
 const outcome=a.signature_id?"SIGNED" as const:a.withdrawn?"WITHDRAWN" as const:a.elapsed||a.released_at?"EXPIRED" as const:"PENDING" as const;
 return {id:a.id,revision:a.revision,digest:a.digest,quoteId:a.quote_id,quoteDigest:a.quote_digest,issuedAt:a.issued_at.toISOString(),expiresAt:a.expires_at.toISOString(),templateVersion:a.template_version,body:a.body,outcome,signature:a.signature_id?{id:a.signature_id,signerName:a.signer_name!,signedAt:a.signed_at!.toISOString()}:null};
}
export type AgreementView=ReturnType<typeof agreementView>;
async function projection(c:PoolClient,ctx:Context){
 const {r,owner,operator}=ctx,q=await currentQuote(c,r.id),latest=await agreementRow(c,r.id),agreement=latest?agreementView(latest):null;
 const history=(await c.query<{id:string;revision:number;issued_at:Date;outcome:"PENDING"|"SIGNED"|"WITHDRAWN"|"EXPIRED"}>("SELECT a.id,a.revision,a.issued_at,CASE WHEN s.id IS NOT NULL THEN 'SIGNED' WHEN EXISTS(SELECT 1 FROM booking_agreement_event e WHERE e.agreement_id=a.id AND e.action='WITHDRAWN') THEN 'WITHDRAWN' WHEN a.expires_at<=clock_timestamp() OR h.released_at IS NOT NULL THEN 'EXPIRED' ELSE 'PENDING' END AS outcome FROM booking_agreement a JOIN booking_hold h ON h.quote_id=a.quote_id LEFT JOIN booking_agreement_signature s ON s.agreement_id=a.id WHERE a.request_id=$1 ORDER BY a.revision DESC LIMIT 20",[r.id])).rows;
 const paused=await cancellationPending(c,r.id),holdActive=Boolean(q?.live&&q.accepted),exact=agreement?.quoteId===q?.id&&agreement?.quoteDigest===q?.digest;
 const serverNow=(await c.query<{now:Date}>("SELECT clock_timestamp() AS now")).rows[0].now.toISOString();
 return {serverNow,requestId:r.id,requestVersion:r.version,status:r.status,isOwner:owner,isOperator:operator,cancellationPending:paused,allocationCommitted:Boolean(q?.committed),canIssue:!paused&&operator&&ctx.agencyActive&&r.status==="QUOTE_ACCEPTED"&&holdActive,canSign:!paused&&owner&&ctx.agencyActive&&r.status==="AGREEMENT_PENDING"&&holdActive&&exact&&agreement?.outcome==="PENDING",holdActive,acceptedQuote:q?.accepted?{id:q.id as string,digest:q.digest as string}:null,agreement,history:history.map(a=>({id:a.id,revision:a.revision,issuedAt:a.issued_at.toISOString(),outcome:a.outcome}))};
}
export async function getAgreement(actor:Actor,id:string){
 return transaction(async c=>{await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");return projection(c,await context(c,actor,id));});
}
export async function getAgreementById(actor:Actor,id:string){
 return transaction(async c=>{
  await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const a=(await c.query("SELECT request_id FROM booking_agreement WHERE id=$1",[uuid.parse(id)])).rows[0];
  if(!a)throw new DomainError("Agreement not found.",404);
  const ctx=await context(c,actor,a.request_id),exact=await agreementRow(c,ctx.r.id,id);
  if(!exact)throw new DomainError("Agreement not found.",404);
  return {requestId:ctx.r.id,agreement:agreementView(exact)};
 });
}
async function event(c:PoolClient,ctx:Context,agreementId:string,action:"ISSUED"|"WITHDRAWN"|"SIGNED",reason:string){
 await c.query("INSERT INTO booking_agreement_event(id,agreement_id,request_id,actor_id,action,reason)VALUES($1,$2,$3,$4,$5,$6)",[randomUUID(),agreementId,ctx.r.id,ctx.user.id,action,reason]);
 await c.query("INSERT INTO booking_event(id,request_id,actor_id,action,message)VALUES($1,$2,$3,$4,$5)",[randomUUID(),ctx.r.id,ctx.user.id,`AGREEMENT_${action}`,reason]);
 await audit(c,ctx.user,`BOOKING_AGREEMENT_${action}`,ctx.r.id,{agreementId,message:reason});
 await c.query("INSERT INTO booking_notification(id,request_id,recipient_id,message)SELECT gen_random_uuid(),$1,a.id,$2 FROM app_actor a WHERE NOT a.suspended AND (a.id=$3 OR a.id IN(SELECT actor_id FROM agency_member WHERE agency_id=$4 AND active))",[ctx.r.id,reason,ctx.r.renter_id,ctx.r.agency_id]);
}
async function setStatus(c:PoolClient,ctx:Context,status:string){
 await c.query("UPDATE booking_request SET status=$2,version=version+1 WHERE id=$1",[ctx.r.id,status]);ctx.r.status=status;ctx.r.version++;
}
function checkVersion(ctx:Context,version:number){if(ctx.r.version!==version)throw new DomainError("This request changed. Reload and try again.",409);}
async function lockLiveQuote(c:PoolClient,ctx:Context,operator:boolean){
 await assertNoPendingCancellation(c,ctx.r.id);
 const authority=await lockBookingAuthority(c,ctx,[ctx.r.renter_id],operator);
 if((await c.query("SELECT is_test_fixture FROM app_actor WHERE id=$1",[ctx.user.id])).rows[0]?.is_test_fixture)throw new DomainError("Access denied.",403);
 if(!authority.active)throw new DomainError("This agency is currently unavailable.",409);
 // Shared authority rechecks actors under its sorted actor locks, then member.
 const q=await currentQuote(c,ctx.r.id);
 const h=(await c.query("SELECT *,expires_at<=clock_timestamp() AS elapsed FROM booking_hold WHERE request_id=$1 AND released_at IS NULL FOR UPDATE",[ctx.r.id])).rows[0];
 if(!q?.accepted||!h||h.quote_id!==q.id||h.elapsed)throw new DomainError("The accepted quotation hold is no longer valid. Reload before continuing.",409);
 return q;
}
export async function changeAgreement(actor:Actor,id:string,input:unknown){
 const command=agreementCommand.parse(input);
 return transaction(async c=>{
  const ctx=await context(c,actor,id,true);checkVersion(ctx,command.version);
  if(!ctx.operator)throw new DomainError("Only an independent agency operator may issue or withdraw an agreement.",403);
  if(ctx.r.status!==(command.action==="ISSUE_AGREEMENT"?"QUOTE_ACCEPTED":"AGREEMENT_PENDING"))throw new DomainError("This request is not at the required agreement stage.",409);
  await assertGatewaySourceReplaceable(c,id);
  const q=await lockLiveQuote(c,ctx,true);
  if(command.action==="ISSUE_AGREEMENT"){
   if(command.quoteId!==q.id||command.digest!==q.digest)throw new DomainError("Review the exact accepted quotation before issuing an agreement.",409);
   const lines=(await c.query("SELECT public_quote FROM booking_request_line WHERE request_id=$1 ORDER BY id",[ctx.r.id])).rows;
   // Agency contact comes from the immutable revision saved with this request.
   const policyRevision=lines[0]?.public_quote.policyRevision;
   const saved=(await c.query("SELECT p.payload FROM agency a JOIN partner_revision p ON p.application_id=a.application_id AND p.revision=$2 WHERE a.id=$1",[ctx.r.agency_id,policyRevision])).rows[0]?.payload;
   if(!saved)throw new DomainError("The saved agency contact revision is unavailable.",409);
   const body=agreementBody(ctx.r.agency_name,ctx.r.contact.name,q.public_snapshot),privateContactSnapshot={renter:ctx.r.contact,agency:{email:saved.email,phone:saved.phone,address:saved.address,supportContact:saved.supportContact}};
   const agreementId=randomUUID(),revision=Number((await c.query("SELECT COALESCE(max(revision),0)+1 AS n FROM booking_agreement WHERE request_id=$1",[ctx.r.id])).rows[0].n),issuedAt=(await c.query<{now:Date}>("SELECT clock_timestamp() AS now")).rows[0].now.toISOString(),expiresAt=new Date(q.expires_at).toISOString();
   if(Date.parse(issuedAt)>=Date.parse(expiresAt))throw new DomainError("The quotation hold expired. Request a new quotation.",409);
   const digest=agreementDigest({id:agreementId,requestId:ctx.r.id,revision,quoteId:q.id,quoteDigest:q.digest,issuedAt,expiresAt,templateVersion:AGREEMENT_TEMPLATE_VERSION,body,privateContactSnapshot});
   await c.query("INSERT INTO booking_agreement(id,request_id,quote_id,revision,digest,quote_digest,template_version,issued_by,issued_at,expires_at,body,private_contact_snapshot)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",[agreementId,ctx.r.id,q.id,revision,digest,q.digest,AGREEMENT_TEMPLATE_VERSION,ctx.user.id,issuedAt,expiresAt,body,privateContactSnapshot]);
   await setStatus(c,ctx,"AGREEMENT_PENDING");await event(c,ctx,agreementId,"ISSUED","Exact accepted quotation agreement issued. Electronic consent is required; payment remains pending.");
  }else{
   const a=await agreementRow(c,id);
   if(!a||a.id!==command.agreementId||a.digest!==command.digest||a.quote_id!==q.id||a.quote_digest!==q.digest||a.signature_id||a.withdrawn)throw new DomainError("This exact pending agreement is no longer current.",409);
   await setStatus(c,ctx,"QUOTE_ACCEPTED");await event(c,ctx,a.id,"WITHDRAWN",command.reason);
  }
  return projection(c,ctx);
 });
}
async function signatureContext(c:PoolClient,actor:Actor,id:string,input:ReturnType<typeof signatureCommand.parse>){
 const ctx=await context(c,actor,id,true);checkVersion(ctx,input.version);
 if(!ctx.owner)throw new DomainError("Only the authenticated renter may sign this agreement.",403);
 if(ctx.r.status!=="AGREEMENT_PENDING")throw new DomainError("This agreement is no longer awaiting a signature.",409);
 const q=await lockLiveQuote(c,ctx,false),a=await agreementRow(c,id);
 if(!a||a.id!==input.agreementId||a.digest!==input.digest||a.quote_id!==q.id||a.quote_digest!==q.digest||a.withdrawn||a.signature_id||a.elapsed)throw new DomainError("Review the exact current agreement before signing.",409);
 validateSignerName(input.signerName,a.body.renterName);
 return {ctx,a};
}
export async function authorizeAgreementSignature(actor:Actor,id:string,input:unknown){
 const command=signatureCommand.parse(input);
 return transaction(async c=>{await signatureContext(c,actor,id,command);return {requestId:id};});
}
export type SignatureUpload={id:string;mime:string;size:number;sha256:string;backend:string};
export async function attachAgreementSignature(actor:Actor,id:string,input:unknown,file:SignatureUpload){
 const command=signatureCommand.parse(input);
 return transaction(async c=>{
  const {ctx,a}=await signatureContext(c,actor,id,command);
  uuid.parse(file.id);
  if(!["image/png","image/jpeg"].includes(file.mime)||!Number.isInteger(file.size)||file.size<1||file.size>1048576||!/^([a-f0-9]{64})$/.test(file.sha256)||!["s3","local"].includes(file.backend))throw new DomainError("Invalid private signature evidence.",422);
  const signedAt=(await c.query<{now:Date}>("SELECT clock_timestamp() AS now")).rows[0].now;
  if(signedAt>=a.expires_at)throw new DomainError("The quotation hold expired before signing. Reload before continuing.",409);
  await c.query("INSERT INTO booking_agreement_signature(id,agreement_id,request_id,quote_id,agreement_digest,signer_id,signer_name,consent,signed_at,mime,size_bytes,sha256,backend)VALUES($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10,$11,$12)",[file.id,a.id,id,a.quote_id,a.digest,ctx.user.id,command.signerName,signedAt,file.mime,file.size,file.sha256,file.backend]);
  await setStatus(c,ctx,"AGREEMENT_SIGNED");await event(c,ctx,a.id,"SIGNED","Renter recorded electronic consent to this exact agreement. Payment and fulfillment remain pending; the quotation hold is unchanged.");
  return projection(c,ctx);
 });
}
export async function bookingSignatureForRead(actor:Actor,id:string){
 return transaction(async c=>{
  await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const file=(await c.query("SELECT * FROM booking_agreement_signature WHERE id=$1",[uuid.parse(id)])).rows[0];
  if(!file)throw new DomainError("Signature not found.",404);
  await context(c,actor,file.request_id);
  return {objectKey:`${file.request_id}/${file.id}`,backend:file.backend as string,mime:file.mime as string,name:`signature-${file.id}.${file.mime==="image/png"?"png":"jpg"}`};
 });
}
