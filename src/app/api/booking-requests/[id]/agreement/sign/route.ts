import { randomUUID, createHash } from "node:crypto";
import { requireActor } from "@/lib/auth";
import { apiError, json, requireOrigin, boundedBody, uuid } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { storeFile, removeOrphan } from "@/lib/storage";
import { storageDriver } from "@/lib/storage-config";
import { DomainError } from "@/modules/partners/workflow";
import { signatureCommand, validateSignatureImage } from "@/modules/bookings/agreement-schema";
import { authorizeAgreementSignature, attachAgreementSignature } from "@/modules/bookings/agreement";
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){
 let orphan:string|undefined;
 try{
  requireOrigin(req);const actor=await requireActor(),id=uuid.parse((await ctx.params).id);
  await rateLimit(`${actor.id}:booking-signatures`,10);
  const contentType=req.headers.get("content-type")??"";
  if(!contentType.startsWith("multipart/form-data;"))throw new DomainError("Send a multipart signature upload.",415);
  const body=await boundedBody(req,1280*1024);let form:FormData;
  try{form=await new Response(body,{headers:{"content-type":contentType}}).formData();}catch{throw new DomainError("Invalid signature upload form.",422);}
  const allowed=new Set(["file","version","agreementId","digest","signerName","consent"]);
  for(const key of form.keys())if(!allowed.has(key)||form.getAll(key).length!==1)throw new DomainError("Send only the exact signature fields once.",422);
  const command=signatureCommand.parse({version:Number(form.get("version")),agreementId:form.get("agreementId"),digest:form.get("digest"),signerName:form.get("signerName"),consent:form.get("consent")==="true"});
  const file=form.get("file");if(!(file instanceof File))throw new DomainError("Choose a signature image.",422);
  const bytes=Buffer.from(await file.arrayBuffer()),mime=validateSignatureImage(bytes,file.type),backend=storageDriver(process.env.STORAGE_DRIVER);
  await authorizeAgreementSignature(actor,id,command);
  const fileId=randomUUID(),key=`${id}/${fileId}`;
  orphan=key;await storeFile(key,bytes,mime);
  const saved=await attachAgreementSignature(actor,id,command,{id:fileId,mime,size:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex"),backend});
  orphan=undefined;return json(saved,201);
 }catch(e){
  if(orphan)await removeOrphan(orphan).catch(()=>{});
  return apiError(e);
 }
}
