import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({actor:vi.fn(),limit:vi.fn(),count:vi.fn()}));vi.mock('@/lib/auth',()=>({requireActor:m.actor}));vi.mock('@/lib/rate-limit',()=>({rateLimit:m.limit}));vi.mock('@/modules/notifications/service',()=>({getUnreadNotificationCount:m.count}));
import {GET} from '../../src/app/api/notifications/count/route';
import {DomainError} from '../../src/modules/partners/workflow';
const url='http://localhost:3100/api/notifications/count';
beforeEach(()=>{vi.resetAllMocks();m.actor.mockResolvedValue({id:'person',role:'RENTER'});m.count.mockResolvedValue({actorId:'person',unread:2,preparedAt:'2030-01-01T00:00:00Z'});});
it('requires a signed-in actor and refuses recipient selection or query overrides',async()=>{
 m.actor.mockRejectedValueOnce(new DomainError('Sign in',401));expect((await GET(new Request(url))).status).toBe(401);expect((await GET(new Request(url+'?recipientId=foreign'))).status).toBe(422);expect(m.count).not.toHaveBeenCalled();
});
it('returns uncached recipient-only counts with its own budget and preserves access denial',async()=>{
 const result=await GET(new Request(url));expect(result.headers.get('cache-control')).toBe('no-store');expect(await result.json()).toMatchObject({actorId:'person',unread:2});expect(m.count).toHaveBeenCalledWith({id:'person',role:'RENTER'});expect(m.limit).toHaveBeenCalledWith('person:notification-count',60);m.count.mockRejectedValueOnce(new DomainError('Access denied',403));expect((await GET(new Request(url))).status).toBe(403);
});
