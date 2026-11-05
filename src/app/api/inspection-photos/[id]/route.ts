import {requireActor} from "@/lib/auth";
import {apiError} from "@/lib/http";
import {loadFile} from "@/lib/storage";
import {inspectionPhotoForRead} from "@/modules/bookings/fulfillment";
export async function GET(_:Request,ctx:{params:Promise<{id:string}>}){try{
 const f=await inspectionPhotoForRead(await requireActor(),(await ctx.params).id),bytes=await loadFile(f.objectKey,f.backend);
 return new Response(bytes,{headers:{"Content-Type":f.mime,"Content-Disposition":`inline; filename="${f.name}"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox","Cross-Origin-Resource-Policy":"same-origin"}});
}catch(e){return apiError(e);}}
