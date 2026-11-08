import {beforeEach,it,expect,vi} from 'vitest';
import {DomainError} from '../../src/modules/partners/workflow';
const m=vi.hoisted(()=>({actor:vi.fn(),limit:vi.fn(),get:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireActor:m.actor}));vi.mock('@/lib/rate-limit',()=>({rateLimit:m.limit}));vi.mock('@/modules/gateway/reconciliation',()=>({getPaymentReconciliation:m.get}));
import {GET} from '../../src/app/api/payments/reconciliation/route';
const url='http://localhost:3100/api/payments/reconciliation';
beforeEach(()=>{vi.resetAllMocks();m.actor.mockResolvedValue({id:'admin',role:'SUPER_ADMIN'});m.get.mockResolvedValue({items:[]});});
it('requires current access and returns no-store records without accepting duplicate filters',async()=>{
 m.actor.mockRejectedValueOnce(new DomainError('Sign in.',401));expect((await GET(new Request(url))).status).toBe(401);expect(m.get).not.toHaveBeenCalled();
 m.get.mockRejectedValueOnce(new DomainError('Platform payment-review access is required.',403));expect((await GET(new Request(url))).status).toBe(403);
 const r=await GET(new Request(url+'?mode=test&reference=booking'));expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');expect(m.get.mock.calls.at(-1)?.[1]).toEqual({mode:'test',reference:'booking'});
});
it('rejects repeated scope filters before querying cases',async()=>{expect((await GET(new Request(url+'?mode=test&mode=live'))).status).toBe(422);expect(m.get).not.toHaveBeenCalled();});
