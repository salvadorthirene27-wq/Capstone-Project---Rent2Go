import { randomUUID,createHash } from "node:crypto";
import { requireActor } from "@/lib/auth";
import { apiError,json,requireOrigin,boundedBody,uuid } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { storeFile,removeOrphan } from "@/lib/storage";
import { storageDriver } from "@/lib/storage-config";
import { DomainError } from "@/modules/partners/workflow";
import { evidenceCommand,validatePaymentEvidence } from "@/modules/bookings/payment-schema";
import { authorizePaymentEvidence,attachPaymentEvidence } from "@/modules/bookings/payment";
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){
 let orphan:string|undefined;
 try{
  requireOrigin(req);const actor=await requireActor(),id=uuid.parse((await ctx.params).id);await rateLimit(`${actor.id}:booking-payment-evidence`,10);
  const contentType=req.headers.get("content-type")??"";if(!contentType.startsWith("multipart/form-data;"))throw new DomainError("Send a multipart evidence upload.",415);
  const body=await boundedBody(req,5.25*1024*1024);let form:FormData;try{form=await new Response(body,{headers:{"content-type":contentType}}).formData();}catch{throw new DomainError("Invalid payment evidence form.",422);}
  const fields=["file","version","idempotencyKey","agreementId","digest","amountCentavos","reference"],allowed=new Set(fields);
  for(const key of form.keys())if(!allowed.has(key)||form.getAll(key).length!==1)throw new DomainError("Send only the exact payment evidence fields once.",422);
  if(fields.some(key=>form.getAll(key).length!==1))throw new DomainError("Complete every payment evidence field.",422);
  const command=evidenceCommand.parse({version:Number(form.get("version")),idempotencyKey:form.get("idempotencyKey"),agreementId:form.get("agreementId"),digest:form.get("digest"),amountCentavos:Number(form.get("amountCentavos")),reference:form.get("reference")});
  const file=form.get("file");if(!(file instanceof File))throw new DomainError("Choose payment evidence.",422);
  const bytes=Buffer.from(await file.arrayBuffer()),mime=validatePaymentEvidence(bytes,file.type),sha256=createHash("sha256").update(bytes).digest("hex"),backend=storageDriver(process.env.STORAGE_DRIVER);
  const preflight=await authorizePaymentEvidence(actor,id,command,sha256);if(preflight.alreadyApplied)return json(preflight.state,201);
  const fileId=randomUUID(),key=`${id}/${fileId}`;orphan=key;await storeFile(key,bytes,mime);
  const attached=await attachPaymentEvidence(actor,id,command,{id:fileId,mime,size:bytes.length,sha256,backend});
  if(!attached.usedFile)await removeOrphan(key);orphan=undefined;return json(attached.state,201);
 }catch(e){if(orphan)await removeOrphan(orphan).catch(()=>{});return apiError(e);}
}
