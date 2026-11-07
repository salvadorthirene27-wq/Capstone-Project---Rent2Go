import {afterEach,beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({actor:vi.fn(),limit:vi.fn(),get:vi.fn(),read:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireActor:m.actor}));vi.mock('@/lib/rate-limit',()=>({rateLimit:m.limit}));vi.mock('@/modules/notifications/service',()=>({getInbox:m.get,markNotificationsRead:m.read}));
import {GET,PATCH} from '../../src/app/api/notifications/route';
import {readNotifications} from '../../src/modules/notifications/schema';
import {DomainError} from '../../src/modules/partners/workflow';
const base='http://localhost:3100',url=base+'/api/notifications',id='c79318ab-a56e-4cc8-a8b0-a3e4676d7b36';
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('APP_ORIGIN',base);m.actor.mockResolvedValue({id:'owner',role:'COSIGNER'});m.get.mockResolvedValue({items:[]});m.read.mockResolvedValue({items:[]});});afterEach(()=>vi.unstubAllEnvs());
it('checks mutation Origin before auth and rejects duplicate read filters before a service call',async()=>{
 expect((await PATCH(new Request(url,{method:'PATCH',headers:{origin:'https://foreign.test','Content-Type':'application/json'},body:'{}'}))).status).toBe(403);expect(m.actor).not.toHaveBeenCalled();expect((await GET(new Request(url+'?status=ALL&status=UNREAD'))).status).toBe(422);expect(m.get).not.toHaveBeenCalled();m.actor.mockRejectedValue(new DomainError('Sign in',401));expect((await GET(new Request(url))).status).toBe(401);
});
it('returns uncached recipient-derived reads and propagates denied receipt batches',async()=>{
 const response=await GET(new Request(url+'?category=VEHICLE'));expect(response.headers.get('cache-control')).toBe('no-store');expect(m.get).toHaveBeenCalledWith({id:'owner',role:'COSIGNER'},{category:'VEHICLE'});m.read.mockRejectedValue(new DomainError('Unavailable update',404));expect((await PATCH(new Request(url,{method:'PATCH',headers:{origin:base,'Content-Type':'application/json'},body:JSON.stringify({items:[{source:'BOOKING',id}]})}))).status).toBe(404);
});
it('rejects selected-recipient forgery, duplicate keys and more than one visible page of reads',()=>{
 const item={source:'BOOKING',id};expect(readNotifications.safeParse({recipientId:'foreign',items:[item]}).success).toBe(false);expect(readNotifications.safeParse({items:[item,item]}).success).toBe(false);expect(readNotifications.safeParse({items:Array(21).fill(item)}).success).toBe(false);expect(readNotifications.safeParse({items:[item],query:{includePrivate:true}}).success).toBe(false);
});
