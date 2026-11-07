import {privacyIdentity} from '@/modules/governance/identity';
import {getPrivacyCases,createPrivacyCase} from '@/modules/governance/privacy';
import {apiError,json,readJson,requireOrigin} from '@/lib/http';
import {rateLimit} from '@/lib/rate-limit';
import {DomainError} from '@/modules/partners/workflow';
export async function GET(req:Request){try{const u=await privacyIdentity();await rateLimit(`${u.id}:privacy-reads`,50);const q=new URL(req.url).searchParams;for(const k of q.keys())if(q.getAll(k).length!==1)throw new DomainError('Send each privacy filter once.',422);return json(await getPrivacyCases(u,Object.fromEntries(q)));}catch(e){return apiError(e);}}
export async function POST(req:Request){try{requireOrigin(req);const u=await privacyIdentity();await rateLimit(`${u.id}:privacy-requests`,8);return json(await createPrivacyCase(u,await readJson(req)),201);}catch(e){return apiError(e);}}
