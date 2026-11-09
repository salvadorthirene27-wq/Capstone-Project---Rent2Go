import {requireActor} from '@/lib/auth';
import {apiError,json,uuid,readJson,requireOrigin} from '@/lib/http';
import {rateLimit} from '@/lib/rate-limit';
import {getCentralFunding,changeCentralFunding} from '@/modules/gateway/funding';
import {z} from 'zod';
import {DomainError} from '@/modules/partners/workflow';
const query=z.object({page:z.coerce.number().int().min(1).max(10000).default(1)}).strict();
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){try{const actor=await requireActor();await rateLimit(`${actor.id}:agency-funding-reads`,60);const p=new URL(req.url).searchParams;if([...p.keys()].some(k=>p.getAll(k).length!==1))throw new DomainError('Send each disbursement filter once.',422);const q=query.parse(Object.fromEntries(p));return json(await getCentralFunding(actor,uuid.parse((await ctx.params).id),q.page));}catch(e){return apiError(e);}}
export async function PATCH(req:Request,ctx:{params:Promise<{id:string}>}){try{requireOrigin(req);const actor=await requireActor();await rateLimit(`${actor.id}:agency-fundings`,30);return json(await changeCentralFunding(actor,uuid.parse((await ctx.params).id),await readJson(req)));}catch(e){return apiError(e);}}
