import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({actor:vi.fn(),limit:vi.fn(),get:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireActor:m.actor}));vi.mock('@/lib/rate-limit',()=>({rateLimit:m.limit}));vi.mock('@/modules/gateway/custody',()=>({getCentralCustody:m.get}));
import {GET} from '../../src/app/api/booking-requests/[id]/custody/route';
import {DomainError} from '../../src/modules/partners/workflow';
const id='c79318ab-a56e-4cc8-a8b0-a3e4676d7b36',ctx={params:Promise.resolve({id})},url='http://localhost:3100/api/booking-requests/'+id+'/custody';
beforeEach(()=>{vi.resetAllMocks();m.actor.mockResolvedValue({id:'operator',role:'RENTER'});m.get.mockResolvedValue({available:false,canDisburse:false});});
it('requires authentication, a valid source and rejects all client-supplied totals',async()=>{
 m.actor.mockRejectedValueOnce(new DomainError('Sign in',401));expect((await GET(new Request(url),ctx)).status).toBe(401);
 expect((await GET(new Request(url+'?collectedCentavos=10000'),ctx)).status).toBe(422);
 expect((await GET(new Request(url),{params:Promise.resolve({id:'invalid'})})).status).toBe(422);expect(m.get).not.toHaveBeenCalled();
});
it('preserves scoped errors and never caches financial projections',async()=>{
 const r=await GET(new Request(url),ctx);expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');expect(m.get).toHaveBeenCalledWith({id:'operator',role:'RENTER'},id);
 m.get.mockRejectedValueOnce(new DomainError('Central collection account not found.',404));expect((await GET(new Request(url),ctx)).status).toBe(404);
});
