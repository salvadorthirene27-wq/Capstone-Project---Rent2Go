import {randomUUID,createHash} from 'node:crypto';
import {requireActor} from '@/lib/auth';
import {apiError,json,requireOrigin,boundedBody,uuid} from '@/lib/http';
import {rateLimit} from '@/lib/rate-limit';
import {storeFile,removeOrphan} from '@/lib/storage';
import {storageDriver} from '@/lib/storage-config';
import {db} from '@/lib/db';
import {DomainError} from '@/modules/partners/workflow';
import {validatePaymentEvidence} from '@/modules/bookings/payment-schema';
import {fundingEvidenceCommand} from '@/modules/gateway/funding';
import {authorizeFundingUpload,attachCentralFunding} from '@/modules/gateway/funding';
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){
 let orphan:{key:string;id:string}|undefined;
 try{
  requireOrigin(req);const actor=await requireActor(),id=uuid.parse((await ctx.params).id);await rateLimit(`${actor.id}:agency-funding-evidence`,10);
  const type=req.headers.get('content-type')??'';if(!type.startsWith('multipart/form-data;'))throw new DomainError('Send multipart agency funding evidence.',415);
  const bytes=await boundedBody(req,5.25*1024*1024);let form:FormData;try{form=await new Response(bytes,{headers:{'content-type':type}}).formData();}catch{throw new DomainError('Invalid agency funding evidence form.',422);}
  const keys=['action','file','version','idempotencyKey','sourceDigest','reference','reason','accepted'];for(const key of form.keys())if(!keys.includes(key)||form.getAll(key).length!==1)throw new DomainError('Send each agency funding evidence field once.',422);if(keys.some(k=>form.getAll(k).length!==1))throw new DomainError('Complete every agency funding evidence field.',422);
  const command=fundingEvidenceCommand.parse({action:form.get('action'),version:Number(form.get('version')),idempotencyKey:form.get('idempotencyKey'),sourceDigest:form.get('sourceDigest'),reference:form.get('reference'),reason:form.get('reason'),accepted:form.get('accepted')==='true'}),file=form.get('file');if(!(file instanceof File))throw new DomainError('Choose agency funding evidence.',422);
  const content=Buffer.from(await file.arrayBuffer()),mime=validatePaymentEvidence(content,file.type),sha256=createHash('sha256').update(content).digest('hex'),preflight=await authorizeFundingUpload(actor,id,command,sha256);
  if(preflight.alreadyApplied)return json(preflight.state,201);
  const fileId=randomUUID(),key=`${id}/${fileId}`,backend=storageDriver(process.env.STORAGE_DRIVER);orphan={id:fileId,key};await storeFile(key,content,mime);
  const result=await attachCentralFunding(actor,id,command,{id:fileId,mime,size:content.length,sha256,backend});if(!result.usedFile)await removeOrphan(key);orphan=undefined;return json(result.state,201);
 }catch(e){
  // A failed/ambiguous COMMIT must never delete evidence that was committed.
  if(orphan){try{if(!(await db.query('SELECT 1 FROM central_funding_file WHERE id=$1',[orphan.id])).rowCount)await removeOrphan(orphan.key);}catch{/* Retain an uncertain orphan for a later audited cleanup. */}}
  return apiError(e);
 }
}
