import { requireActor } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { loadFile } from "@/lib/storage";
import { bookingSignatureForRead } from "@/modules/bookings/agreement";
export async function GET(_:Request,ctx:{params:Promise<{id:string}>}){
 try{
  const file=await bookingSignatureForRead(await requireActor(),(await ctx.params).id),bytes=await loadFile(file.objectKey,file.backend);
  return new Response(bytes,{headers:{"Content-Type":file.mime,"Content-Disposition":`inline; filename="${file.name}"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox","Cross-Origin-Resource-Policy":"same-origin"}});
 }catch(e){return apiError(e);}
}
