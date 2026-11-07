import {randomUUID,createHash} from 'node:crypto';
import {requireActor} from '@/lib/auth';
import {apiError,json,requireOrigin,boundedBody} from '@/lib/http';
import {rateLimit} from '@/lib/rate-limit';
import {storeFile,removeOrphan} from '@/lib/storage';
import {storageDriver} from '@/lib/storage-config';
import {DomainError} from '@/modules/partners/workflow';
import {validatePaymentEvidence} from '@/modules/bookings/payment-schema';
import {remittanceRequest} from '@/modules/accounting/remittance-http';
import {remittanceEvidenceCommand} from '@/modules/accounting/remittance-schema';
import {authorizeRemittanceEvidence,attachRemittanceEvidence} from '@/modules/accounting/remittance-actions';
export async function POST(req:Request,ctx:{params:Promise<{agencyId:string}>}){
 let orphan:string|undefined;
 try{
  requireOrigin(req);const actor=await requireActor(),{scope}=remittanceRequest(req,(await ctx.params).agencyId,true);await rateLimit(`${actor.id}:remittance-evidence`,10);
  const type=req.headers.get('content-type')??'';if(!type.startsWith('multipart/form-data;'))throw new DomainError('Send multipart payment evidence.',415);
  const bytes=await boundedBody(req,5.25*1024*1024);let form:FormData;try{form=await new Response(bytes,{headers:{'content-type':type}}).formData();}catch{throw new DomainError('Invalid payment evidence form.',422);}
  const keys=['file','action','version','idempotencyKey','remittanceId','digest','reference','note','externalPaid'];for(const key of form.keys())if(!keys.includes(key)||form.getAll(key).length!==1)throw new DomainError('Send only the exact payment evidence fields once.',422);if(keys.some(key=>form.getAll(key).length!==1))throw new DomainError('Complete every payment evidence field.',422);
  const command=remittanceEvidenceCommand.parse({action:form.get('action'),version:Number(form.get('version')),idempotencyKey:form.get('idempotencyKey'),remittanceId:form.get('remittanceId'),digest:form.get('digest'),reference:form.get('reference'),note:form.get('note'),externalPaid:form.get('externalPaid')==='true'}),file=form.get('file');if(!(file instanceof File))throw new DomainError('Choose private payment evidence.',422);
  const content=Buffer.from(await file.arrayBuffer()),mime=validatePaymentEvidence(content,file.type),sha256=createHash('sha256').update(content).digest('hex'),preflight=await authorizeRemittanceEvidence(actor,scope,command,sha256);if(preflight.alreadyApplied)return json(preflight.state,201);
  const id=randomUUID(),key=`${preflight.accountId}/${id}`,backend=storageDriver(process.env.STORAGE_DRIVER);orphan=key;await storeFile(key,content,mime);const result=await attachRemittanceEvidence(actor,scope,command,{id,mime,size:content.length,sha256,backend});if(!result.usedFile)await removeOrphan(key);orphan=undefined;return json(result.state,201);
 }catch(e){if(orphan)await removeOrphan(orphan).catch(()=>{});return apiError(e);}
}
