import {requireActor} from '@/lib/auth';
import {apiError,json,readJson,requireOrigin} from '@/lib/http';
import {rateLimit} from '@/lib/rate-limit';
import {getPlatformSettings,publishPlatformSettings} from '@/modules/platform/service';
export async function GET(){try{const u=await requireActor();await rateLimit(`${u.id}:platform-settings-read`,30);return json(await getPlatformSettings(u));}catch(e){return apiError(e);}}
export async function PATCH(req:Request){try{requireOrigin(req);const u=await requireActor();await rateLimit(`${u.id}:platform-settings-write`,10);return json(await publishPlatformSettings(u,await readJson(req)));}catch(e){return apiError(e);}}
