import {randomUUID,createHash} from "node:crypto";
import {requireActor} from "@/lib/auth";
import {apiError,json,requireOrigin,boundedBody,uuid,versionSchema} from "@/lib/http";
import {rateLimit} from "@/lib/rate-limit";
import {storeFile,removeOrphan} from "@/lib/storage";
import {storageDriver} from "@/lib/storage-config";
import {DomainError} from "@/modules/partners/workflow";
import {validatePaymentEvidence} from "@/modules/bookings/payment-schema";
import {inspectionPhase} from "@/modules/bookings/fulfillment-schema";
import {authorizeInspectionUpload,attachInspectionPhoto} from "@/modules/bookings/fulfillment";
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){
 let orphan:string|undefined;
 try{
  requireOrigin(req);const actor=await requireActor(),id=uuid.parse((await ctx.params).id);await rateLimit(`${actor.id}:inspection-photos`,15);
  const type=req.headers.get("content-type")??"";if(!type.startsWith("multipart/form-data;"))throw new DomainError("Choose a multipart photo upload.",415);
  const bytes=await boundedBody(req,5.25*1024*1024);let form:FormData;try{form=await new Response(bytes,{headers:{"content-type":type}}).formData();}catch{throw new DomainError("Invalid photo upload form.",422);}
  for(const key of form.keys())if(!["file","lineId","phase","version"].includes(key)||form.getAll(key).length!==1)throw new DomainError("Send each inspection photo field once.",422);
  const lineId=uuid.parse(form.get("lineId")),phase=inspectionPhase.parse(form.get("phase")),version=versionSchema.parse(Number(form.get("version"))),file=form.get("file");if(!(file instanceof File))throw new DomainError("Choose an inspection photo.",422);
  const content=Buffer.from(await file.arrayBuffer()),mime=validatePaymentEvidence(content,file.type);if(mime==="application/pdf")throw new DomainError("Inspection photos must be PNG or JPEG.",422);
  await authorizeInspectionUpload(actor,id,lineId,phase,version);const fileId=randomUUID(),key=`${id}/${fileId}`,backend=storageDriver(process.env.STORAGE_DRIVER);orphan=key;await storeFile(key,content,mime);
  const state=await attachInspectionPhoto(actor,id,lineId,phase,version,{id:fileId,mime,size:content.length,sha256:createHash("sha256").update(content).digest("hex"),backend});orphan=undefined;return json(state,201);
 }catch(e){if(orphan)await removeOrphan(orphan).catch(()=>{});return apiError(e);}
}
