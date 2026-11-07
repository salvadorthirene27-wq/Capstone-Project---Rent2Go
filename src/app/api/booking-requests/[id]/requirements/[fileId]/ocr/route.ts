import {requireActor} from '@/lib/auth';
import {apiError,json,readJson,requireOrigin,uuid} from '@/lib/http';
import {rateLimit} from '@/lib/rate-limit';
import {DomainError} from '@/modules/partners/workflow';
import {getDocumentOcr,changeDocumentOcr} from '@/modules/ocr/service';
type Context={params:Promise<{id:string;fileId:string}>};
export async function GET(req:Request,ctx:Context){try{
 const actor=await requireActor();await rateLimit(`${actor.id}:document-text-read`,60);const {id,fileId}=await ctx.params,p=new URL(req.url).searchParams;for(const key of p.keys())if(p.getAll(key).length!==1)throw new DomainError('Send each extraction filter once.',422);return json(await getDocumentOcr(actor,uuid.parse(id),uuid.parse(fileId),Object.fromEntries(p)));
}catch(e){return apiError(e);}}
export async function POST(req:Request,ctx:Context){try{
 requireOrigin(req);const actor=await requireActor();await rateLimit(`${actor.id}:document-text-actions`,10);const {id,fileId}=await ctx.params;return json(await changeDocumentOcr(actor,uuid.parse(id),uuid.parse(fileId),await readJson(req)));
}catch(e){return apiError(e);}}
