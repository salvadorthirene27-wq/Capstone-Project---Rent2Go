import {randomUUID,createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import {transaction} from '../../lib/db';
import {uuid} from '../../lib/http';
import {loadFile} from '../../lib/storage';
import {validateEvidence} from '../../lib/evidence-validation';
import {storedActor,audit} from '../partners/service';
import {DomainError,type Actor} from '../partners/workflow';
import {lockBookingAuthority} from '../bookings/quotation';
import {cancellationPending} from '../bookings/cancellation-guard';
import {ocrCommand,ocrQuery} from './schema';
import {ocrMaxBytes,ocrPolicyVersion} from './presentation';
import {extractDocumentText,ocrFailure,type OcrOutput} from './provider';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function context(c:PoolClient,actor:Pick<Actor,'id'>,requestId:string,fileId:string,lock=false){
 const r=(await c.query(`SELECT id,agency_id,renter_id,status,version FROM booking_request WHERE id=$1${lock?' FOR UPDATE':''}`,[uuid.parse(requestId)])).rows[0],user=await storedActor(actor,c);
 if(!r)throw new DomainError('Document not found.',404);const owner=r.renter_id===user.id;
 if(lock)await lockBookingAuthority(c,{r,user,owner},[r.renter_id],false);
 if((await c.query('SELECT 1 FROM app_actor WHERE id=$1 AND is_test_fixture',[user.id])).rowCount)throw new DomainError('Document not found.',404);
 const agencyActive=Boolean((await c.query('SELECT 1 FROM agency a JOIN app_actor o ON o.id=a.owner_id WHERE a.id=$1 AND a.active AND NOT o.suspended AND NOT o.is_test_fixture',[r.agency_id])).rowCount),operator=!owner&&agencyActive&&Boolean((await c.query('SELECT 1 FROM agency a WHERE a.id=$1 AND (a.owner_id=$2 OR EXISTS(SELECT 1 FROM agency_member m WHERE m.agency_id=a.id AND m.actor_id=$2 AND m.active))',[r.agency_id,user.id])).rowCount);
 if(!owner&&!operator)throw new DomainError('Document not found.',404);
 const f=(await c.query(`SELECT f.*,EXISTS(SELECT 1 FROM booking_requirement_selection WHERE file_id=f.id) ever_submitted,
 f.id=(SELECT id FROM booking_requirement_file WHERE request_id=f.request_id AND purpose=f.purpose ORDER BY created_at DESC,id DESC LIMIT 1) latest_upload,
 EXISTS(SELECT 1 FROM booking_requirement_selection s WHERE s.file_id=f.id AND s.submission_id=(SELECT id FROM booking_requirement_submission WHERE request_id=f.request_id ORDER BY version DESC LIMIT 1)) current_selection,
 EXISTS(SELECT 1 FROM booking_requirement_decision d WHERE d.file_id=f.id AND d.submission_id=(SELECT id FROM booking_requirement_submission WHERE request_id=f.request_id ORDER BY version DESC LIMIT 1)) reviewed
 FROM booking_requirement_file f WHERE f.id=$1 AND f.request_id=$2`,[uuid.parse(fileId),r.id])).rows[0];
 if(!f||(!owner&&!f.ever_submitted))throw new DomainError('Document not found.',404);
 const working=agencyActive&&!await cancellationPending(c,r.id)&&((owner&&['REQUIREMENTS_PENDING','CHANGES_REQUESTED'].includes(r.status)&&f.latest_upload)||(r.status==='UNDER_REVIEW'&&f.current_selection&&!f.reviewed));
 return {r,user,owner,operator,f,working};
}
type Context=Awaited<ReturnType<typeof context>>;
async function consent(c:PoolClient,fileId:string){return (await c.query('SELECT id,decision,created_at FROM booking_ocr_consent WHERE file_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',[fileId])).rows[0];}
async function jobs(c:PoolClient,fileId:string){return (await c.query(`SELECT j.*,r.outcome,r.text_content,r.page_count,r.reason_code,r.digest,r.created_at result_at,v.decision comparison,v.note comparison_note,v.created_at comparison_at,clock_timestamp()>=j.deadline_at overdue FROM booking_ocr_job j LEFT JOIN booking_ocr_result r ON r.job_id=j.id LEFT JOIN booking_ocr_review v ON v.job_id=j.id WHERE j.file_id=$1 ORDER BY j.created_at DESC,j.id DESC LIMIT 10`,[fileId])).rows;}
async function projection(c:PoolClient,ctx:Context,selectedId?:string){
 const permission=await consent(c,ctx.f.id),history=await jobs(c,ctx.f.id),selected=selectedId?history.find(j=>j.id===selectedId):history[0];if(selectedId&&!selected)throw new DomainError('Extraction not found.',404);
 const pending=history.find(j=>!j.ended_at),available=Boolean(process.env.OCR_SPACE_API_KEY),integrity=/^[a-f0-9]{64}$/.test(ctx.f.sha256),supported=ctx.f.size<=ocrMaxBytes&&integrity;
 const blockedReason=!ctx.working?'Text extraction is unavailable at this document review stage.':!available?'Text extraction is unavailable. Manual document review remains available.':!supported?'Text extraction needs a supported document of 1 MB or smaller with valid saved file details.':history.length>=10?'The extraction limit for this document is reached. Use manual review.':!ctx.owner&&permission?.decision!=='ALLOW'?'The renter must authorize OCR.Space for this exact document first.':null;
 const item=selected?{id:selected.id,createdAt:selected.created_at.toISOString() as string,dispatchedAt:selected.dispatch_at?.toISOString() as string|null??null,deadlineAt:selected.deadline_at.toISOString() as string,outcome:(selected.outcome??'PENDING') as string,text:selected.text_content as string|null??'',pages:selected.page_count as number|null??0,reason:selected.reason_code as string|null,digest:selected.digest as string|null,comparison:selected.comparison?{decision:selected.comparison as string,note:selected.comparison_note as string,at:selected.comparison_at.toISOString() as string}:null,
 canCompare:ctx.operator&&ctx.working&&selected.id===history[0].id&&['SUCCEEDED','PARTIAL'].includes(selected.outcome)&&!selected.comparison}:null;
 return {fileId:ctx.f.id as string,requestVersion:ctx.r.version as number,isOwner:ctx.owner,isReviewer:ctx.operator,providerAvailable:available,mime:ctx.f.mime as string,maxBytes:ocrMaxBytes,policyVersion:ocrPolicyVersion,consent:permission?{id:permission.id as string,decision:permission.decision as string,at:permission.created_at.toISOString() as string}:null,canRevoke:ctx.owner&&permission?.decision==='ALLOW',canExtract:!blockedReason&&!pending,blockedReason,pending:pending?{id:pending.id as string,canStop:pending.overdue as boolean,deadlineAt:pending.deadline_at.toISOString() as string}:null,
 selected:item,history:history.map(j=>({id:j.id as string,at:j.created_at.toISOString() as string,outcome:(j.outcome??'PENDING') as string})),asOf:(await c.query('SELECT clock_timestamp() stamp')).rows[0].stamp.toISOString() as string};
}
export type DocumentOcr=Awaited<ReturnType<typeof projection>>;
export async function getDocumentOcr(actor:Actor,requestId:string,fileId:string,input:unknown={}){const q=ocrQuery.parse(input);return transaction(async c=>{const ctx=await context(c,actor,requestId,fileId),state=await projection(c,ctx,q.jobId);if(state.selected?.text)await audit(c,ctx.user,'BOOKING_OCR_RESULT_VIEWED',requestId,{fileId,jobId:state.selected.id});return state;});}
async function addResult(c:PoolClient,jobId:string,output:OcrOutput){await c.query('INSERT INTO booking_ocr_result(job_id,outcome,text_content,page_count,reason_code,provider_code,digest)VALUES($1,$2,$3,$4,$5,$6,$7)',[jobId,output.outcome,output.text,output.pages,output.reason,output.providerCode,hash(output)]);}
const cancelled=(reason:string):OcrOutput=>({...ocrFailure(reason),outcome:'CANCELLED'});
async function finish(jobId:string,output:OcrOutput){return transaction(async c=>{
 const first=(await c.query('SELECT * FROM booking_ocr_job WHERE id=$1',[jobId])).rows[0];if(!first)throw new DomainError('Extraction not found.',404);
 await c.query('SELECT id FROM booking_request WHERE id=$1 FOR UPDATE',[first.request_id]);const job=(await c.query('SELECT * FROM booking_ocr_job WHERE id=$1 FOR UPDATE',[jobId])).rows[0];if(job.ended_at)return;
 let final=output;
 try{const ctx=await context(c,{id:job.actor_id},job.request_id,job.file_id,true),permission=await consent(c,job.file_id);if(permission?.id!==job.consent_id||permission.decision!=='ALLOW')final=cancelled('CONSENT_CHANGED');else if(!ctx.working||ctx.f.sha256!==job.file_sha256)final=cancelled('SOURCE_CHANGED');}
 catch(e){if(e instanceof DomainError&&[403,404,409].includes(e.status))final=cancelled('ACCESS_CHANGED');else throw e;}
 await addResult(c,jobId,final);
 // Audit metadata never contains extracted text, provider errors or credentials.
 await audit(c,{id:job.actor_id,role:'RENTER'},'BOOKING_OCR_FINISHED',job.request_id,{fileId:job.file_id,jobId,outcome:final.outcome,reason:final.reason});
 });}
async function dispatch(jobId:string){return transaction(async c=>{
 const first=(await c.query('SELECT * FROM booking_ocr_job WHERE id=$1',[jobId])).rows[0];if(!first)throw new DomainError('Extraction not found.',404);const ctx=await context(c,{id:first.actor_id},first.request_id,first.file_id,true),job=(await c.query('SELECT *,clock_timestamp()>=deadline_at overdue FROM booking_ocr_job WHERE id=$1 FOR UPDATE',[jobId])).rows[0],permission=await consent(c,job.file_id);
 if(job.ended_at||job.dispatch_at||job.overdue||!ctx.working||permission?.id!==job.consent_id||permission.decision!=='ALLOW')throw new DomainError('Document processing access changed.',409);
 await c.query('UPDATE booking_ocr_job SET dispatch_at=clock_timestamp() WHERE id=$1',[jobId]);return ctx;
 });}
export async function changeDocumentOcr(actor:Actor,requestId:string,fileId:string,input:unknown){
 const command=ocrCommand.parse(input),commandHash=hash(command);
 const started=await transaction(async c=>{
  const ctx=await context(c,actor,requestId,fileId,true),old=(await c.query('SELECT digest FROM booking_ocr_command WHERE file_id=$1 AND actor_id=$2 AND idempotency_key=$3',[fileId,ctx.user.id,command.idempotencyKey])).rows[0];
  if(old){if(old.digest!==commandHash)throw new DomainError('This retry key belongs to another document action.',409);return {job:null,state:await projection(c,ctx)};}
  if(ctx.r.version!==command.version)throw new DomainError('Requirements changed. Refresh this document before continuing.',409);
  const id=randomUUID(),state=await projection(c,ctx);await c.query('INSERT INTO booking_ocr_command(id,file_id,actor_id,idempotency_key,digest,action)VALUES($1,$2,$3,$4,$5,$6)',[id,fileId,ctx.user.id,command.idempotencyKey,commandHash,command.action]);
  if(command.action==='EXTRACT'){
   if(!state.canExtract)throw new DomainError(state.blockedReason??'An extraction is still running. Refresh its status.',409);
   let permission=await consent(c,fileId);
   if(ctx.owner){const grant=randomUUID();await c.query("INSERT INTO booking_ocr_consent(id,file_id,actor_id,command_id,decision,policy_version,file_sha256)VALUES($1,$2,$3,$4,'ALLOW',$5,$6)",[grant,fileId,ctx.user.id,id,ocrPolicyVersion,ctx.f.sha256]);permission={id:grant,decision:'ALLOW'};}
   if(permission?.decision!=='ALLOW')throw new DomainError('Renter permission is required for this exact document.',409);
   const job=randomUUID();await c.query('INSERT INTO booking_ocr_job(id,request_id,file_id,actor_id,command_id,consent_id,file_sha256)VALUES($1,$2,$3,$4,$5,$6,$7)',[job,requestId,fileId,ctx.user.id,id,permission.id,ctx.f.sha256]);await audit(c,ctx.user,'BOOKING_OCR_REQUESTED',requestId,{fileId,jobId:job,policy:ocrPolicyVersion});return {job,state:await projection(c,ctx)};
  }
  if(command.action==='REVOKE'){
   if(!ctx.owner||!state.canRevoke||state.consent?.id!==command.consentId)throw new DomainError('Refresh the renter document permission before withdrawing it.',409);
   await c.query("INSERT INTO booking_ocr_consent(id,file_id,actor_id,command_id,decision,policy_version,file_sha256)VALUES($1,$2,$3,$4,'REVOKE',$5,$6)",[randomUUID(),fileId,ctx.user.id,id,ocrPolicyVersion,ctx.f.sha256]);
   if(state.pending)await addResult(c,state.pending.id,cancelled('CONSENT_CHANGED'));
  }else if(command.action==='CLOSE_STALLED'){
   if(state.pending?.id!==command.jobId||!state.pending.canStop)throw new DomainError('This extraction is still within its processing deadline. Refresh its status.',409);
   await addResult(c,command.jobId,{...ocrFailure('STOPPED'),outcome:'UNKNOWN'});
  }else{
   if(!state.selected?.canCompare||state.selected.id!==command.jobId||state.selected.digest!==command.digest)throw new DomainError('Compare the current extraction with this submitted document first.',409);
   await c.query('INSERT INTO booking_ocr_review(id,job_id,actor_id,command_id,result_digest,decision,note,acknowledged)VALUES($1,$2,$3,$4,$5,$6,$7,true)',[randomUUID(),command.jobId,ctx.user.id,id,command.digest,command.decision,command.note]);
  }
  await audit(c,ctx.user,`BOOKING_OCR_${command.action}`,requestId,{fileId});return {job:null,state:await projection(c,ctx)};
 });
 if(!started.job)return started.state;
 const jobId=started.job;
 try{
  const snapshot=await transaction(async c=>context(c,actor,requestId,fileId)),bytes=await loadFile(`${requestId}/${fileId}`,snapshot.f.backend);
  if(bytes.length!==snapshot.f.size||bytes.length>ocrMaxBytes||createHash('sha256').update(bytes).digest('hex')!==snapshot.f.sha256){await finish(jobId,ocrFailure('FILE_MISMATCH'));}
  else{try{validateEvidence(bytes,snapshot.f.mime,'IDENTITY');}catch{await finish(jobId,ocrFailure('FILE_MISMATCH'));return getDocumentOcr(actor,requestId,fileId);}
   await dispatch(jobId);const output=await extractDocumentText(bytes,snapshot.f.mime);await finish(jobId,output);
  }
 }catch(e){await finish(jobId,ocrFailure(e instanceof DomainError?'SOURCE_CHANGED':'UNAVAILABLE'));}
 return getDocumentOcr(actor,requestId,fileId);
}
