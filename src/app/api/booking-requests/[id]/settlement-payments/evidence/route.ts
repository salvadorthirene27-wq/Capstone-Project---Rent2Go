import {randomUUID,createHash} from 'node:crypto';
import {requireActor} from '@/lib/auth';
import {apiError,json,requireOrigin,boundedBody,uuid} from '@/lib/http';
import {rateLimit} from '@/lib/rate-limit';
import {storeFile,removeOrphan} from '@/lib/storage';
import {storageDriver} from '@/lib/storage-config';
import {DomainError} from '@/modules/partners/workflow';
import {validatePaymentEvidence} from '@/modules/bookings/payment-schema';
import {balanceEvidenceCommand,authorizeBalanceEvidence,attachBalanceEvidence} from '@/modules/bookings/settlement-payment';
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){
 let orphan:string|undefined;
 try{
  requireOrigin(req);const actor=await requireActor(),id=uuid.parse((await ctx.params).id);await rateLimit(`${actor.id}:settlement-evidence`,10);
  const type=req.headers.get('content-type')??'';if(!type.startsWith('multipart/form-data;'))throw new DomainError('Send multipart balance evidence.',415);
  const bytes=await boundedBody(req,5.25*1024*1024);let form:FormData;try{form=await new Response(bytes,{headers:{'content-type':type}}).formData();}catch{throw new DomainError('Invalid balance evidence form.',422);}
  const fields=['file','version','idempotencyKey','settlementId','digest','amountCentavos','reference'];for(const key of form.keys())if(!fields.includes(key)||form.getAll(key).length!==1)throw new DomainError('Send only the exact balance evidence fields once.',422);
  if(fields.some(key=>form.getAll(key).length!==1))throw new DomainError('Complete every balance evidence field.',422);
  const command=balanceEvidenceCommand.parse({version:Number(form.get('version')),idempotencyKey:form.get('idempotencyKey'),settlementId:form.get('settlementId'),digest:form.get('digest'),amountCentavos:Number(form.get('amountCentavos')),reference:form.get('reference')}),file=form.get('file');if(!(file instanceof File))throw new DomainError('Choose payment evidence.',422);
  const content=Buffer.from(await file.arrayBuffer()),mime=validatePaymentEvidence(content,file.type),sha256=createHash('sha256').update(content).digest('hex'),backend=storageDriver(process.env.STORAGE_DRIVER),preflight=await authorizeBalanceEvidence(actor,id,command,sha256);
  if(preflight.alreadyApplied)return json(preflight.state,201);
  const fileId=randomUUID(),key=`${id}/${fileId}`;orphan=key;await storeFile(key,content,mime);const attached=await attachBalanceEvidence(actor,id,command,{id:fileId,mime,size:content.length,sha256,backend});if(!attached.usedFile)await removeOrphan(key);orphan=undefined;return json(attached.state,201);
 }catch(e){if(orphan)await removeOrphan(orphan).catch(()=>{});return apiError(e);}
}
