import {randomUUID,createHash} from 'node:crypto';
import {requireActor} from '@/lib/auth';
import {apiError,json,requireOrigin,boundedBody} from '@/lib/http';
import {rateLimit} from '@/lib/rate-limit';
import {storeFile,removeOrphan} from '@/lib/storage';
import {storageDriver} from '@/lib/storage-config';
import {DomainError} from '@/modules/partners/workflow';
import {validatePaymentEvidence} from '@/modules/bookings/payment-schema';
import {accountRequest} from '@/modules/accounting/http';
import {payoutEvidenceCommand} from '@/modules/accounting/schema';
import {authorizeOwnerPayout,attachOwnerPayout} from '@/modules/accounting/owner-accounts';
export async function POST(req:Request,ctx:{params:Promise<{agencyId:string;ownerId:string}>}){
 let orphan:string|undefined;
 try{
  requireOrigin(req);const actor=await requireActor(),{scope}=accountRequest(req,await ctx.params,true);await rateLimit(`${actor.id}:owner-payout-evidence`,10);
  const type=req.headers.get('content-type')??'';if(!type.startsWith('multipart/form-data;'))throw new DomainError('Send multipart payout evidence.',415);
  const bytes=await boundedBody(req,5.25*1024*1024);let form:FormData;try{form=await new Response(bytes,{headers:{'content-type':type}}).formData();}catch{throw new DomainError('Invalid payout evidence form.',422);}
  const keys=['file','version','idempotencyKey','withdrawalId','reference','reason','externalPaid'];for(const key of form.keys())if(!keys.includes(key)||form.getAll(key).length!==1)throw new DomainError('Send only the exact payout evidence fields once.',422);if(keys.some(key=>form.getAll(key).length!==1))throw new DomainError('Complete every payout evidence field.',422);
  const command=payoutEvidenceCommand.parse({version:Number(form.get('version')),idempotencyKey:form.get('idempotencyKey'),withdrawalId:form.get('withdrawalId'),reference:form.get('reference'),reason:form.get('reason'),externalPaid:form.get('externalPaid')==='true'}),file=form.get('file');if(!(file instanceof File))throw new DomainError('Choose payout evidence.',422);
  const content=Buffer.from(await file.arrayBuffer()),mime=validatePaymentEvidence(content,file.type),sha256=createHash('sha256').update(content).digest('hex'),preflight=await authorizeOwnerPayout(actor,scope,command,sha256);
  if(preflight.alreadyApplied)return json(preflight.state,201);if(!preflight.state.accountId)throw new DomainError('The approved owner account needs review.',409);
  const id=randomUUID(),key=`${preflight.state.accountId}/${id}`,backend=storageDriver(process.env.STORAGE_DRIVER);orphan=key;await storeFile(key,content,mime);const result=await attachOwnerPayout(actor,scope,command,{id,mime,size:content.length,sha256,backend});if(!result.usedFile)await removeOrphan(key);orphan=undefined;return json(result.state,201);
 }catch(e){if(orphan)await removeOrphan(orphan).catch(()=>{});return apiError(e);}
}
