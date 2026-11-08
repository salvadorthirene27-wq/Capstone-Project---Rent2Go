import {apiError,boundedBody,json} from '@/lib/http';
import {DomainError} from '@/modules/partners/workflow';
import {notificationConfig,receivePayMongoNotification} from '@/modules/gateway/notifications';
export async function POST(req:Request){try{
 notificationConfig();
 const signature=req.headers.get('paymongo-signature');if(!signature||signature.length>1024)throw new DomainError('Invalid payment notification signature.',401);
 if(!req.headers.get('content-type')?.toLowerCase().includes('application/json'))throw new DomainError('Send a JSON notification.',415);
 return json(await receivePayMongoNotification(await boundedBody(req,512*1024),signature),202);
}catch(e){return apiError(e);}}
