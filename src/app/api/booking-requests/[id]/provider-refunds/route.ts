import {requireActor} from '@/lib/auth';
import {apiError,json,readJson,requireOrigin,uuid} from '@/lib/http';
import {rateLimit} from '@/lib/rate-limit';
import {queueProviderRefund,reconcileProviderRefund} from '@/modules/gateway/provider-refunds';
import {z} from 'zod';
const reconcile=z.object({action:z.literal('RECONCILE'),intentId:z.uuid(),providerId:z.string().max(160).regex(/^ref_[A-Za-z0-9]+$/)}).strict();
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){try{requireOrigin(req);const actor=await requireActor();await rateLimit(`${actor.id}:provider-refunds`,10);const id=uuid.parse((await ctx.params).id),body=await readJson(req);if(body&&typeof body==='object'&&'action' in body&&body.action==='RECONCILE'){const command=reconcile.parse(body);await reconcileProviderRefund(actor,id,command.intentId,command.providerId);return json({recorded:true});}return json(await queueProviderRefund(actor,id,body),202);}catch(e){return apiError(e);}}
