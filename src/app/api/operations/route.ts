import {requireActor} from '@/lib/auth';
import {apiError,json} from '@/lib/http';
import {rateLimit} from '@/lib/rate-limit';
import {getOperations} from '@/modules/operations/service';
export async function GET(){try{const actor=await requireActor();await rateLimit(`${actor.id}:operations`,30);return json(await getOperations(actor));}catch(e){return apiError(e);}}
