import {randomUUID,createHash} from "node:crypto";
import {requireActor} from "@/lib/auth";
import {apiError,json,requireOrigin,boundedBody,uuid} from "@/lib/http";
import {rateLimit} from "@/lib/rate-limit";
import {storeFile,removeOrphan} from "@/lib/storage";
import {storageDriver} from "@/lib/storage-config";
import {DomainError} from "@/modules/partners/workflow";
import {validatePaymentEvidence} from "@/modules/bookings/payment-schema";
import {refundCommand} from "@/modules/bookings/refund-schema";
import {authorizeRefundEvidence,attachRefundEvidence} from "@/modules/bookings/refund";
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){
 let orphan:string|undefined;
 try{
  requireOrigin(req);const actor=await requireActor(),id=uuid.parse((await ctx.params).id);await rateLimit(`${actor.id}:refund-evidence`,15);const type=req.headers.get("content-type")??"";if(!type.startsWith("multipart/form-data;"))throw new DomainError("Choose a multipart refund proof upload.",415);
  const bytes=await boundedBody(req,5.25*1024*1024);let form:FormData;try{form=await new Response(bytes,{headers:{"content-type":type}}).formData();}catch{throw new DomainError("Invalid refund proof upload.",422);}
  for(const key of form.keys())if(!["file","command"].includes(key)||form.getAll(key).length!==1)throw new DomainError("Send each refund proof field once.",422);
  const raw=form.get("command"),file=form.get("file");if(typeof raw!=="string"||!(file instanceof File))throw new DomainError("Choose proof and the exact manual refund command.",422);let input:unknown;try{input=JSON.parse(raw);}catch{throw new DomainError("Invalid refund proof command.",422);}
  const command=refundCommand.parse(input);if(command.action!=="RECORD_MANUAL_REFUND")throw new DomainError("Choose a manual refund evidence command.",422);
  const content=Buffer.from(await file.arrayBuffer()),mime=validatePaymentEvidence(content,file.type),sha256=createHash("sha256").update(content).digest("hex"),authorization=await authorizeRefundEvidence(actor,id,command,sha256);if(authorization.alreadyApplied)return json(authorization.state);
  const fileId=randomUUID(),key=`${id}/${fileId}`,backend=storageDriver(process.env.STORAGE_DRIVER);orphan=key;await storeFile(key,content,mime);const result=await attachRefundEvidence(actor,id,command,{id:fileId,mime,size:content.length,sha256,backend});if(!result.usedFile)await removeOrphan(key);orphan=undefined;return json(result.state,result.usedFile?201:200);
 }catch(e){if(orphan)await removeOrphan(orphan).catch(()=>{});return apiError(e);}
}
