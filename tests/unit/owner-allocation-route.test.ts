import {beforeEach,afterEach,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({actor:vi.fn(),limit:vi.fn(),get:vi.fn(),change:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireActor:m.actor}));vi.mock('@/lib/rate-limit',()=>({rateLimit:m.limit}));vi.mock('@/modules/bookings/owner-allocation',()=>({getOwnerAllocations:m.get,reviewOwnerAllocation:m.change}));
import {GET,PATCH} from '../../src/app/api/vehicles/[id]/allocation-reviews/route';
import {DomainError} from '../../src/modules/partners/workflow';
const id='e79318ab-a56e-4cc8-a8b0-a3e4676d7b36',ctx={params:Promise.resolve({id})},actor={id:'owner',role:'COSIGNER'},base='http://localhost:3100';
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('APP_ORIGIN',base);m.actor.mockResolvedValue(actor);m.get.mockResolvedValue({items:[]});m.change.mockResolvedValue({decision:'ACCEPT'});});afterEach(()=>vi.unstubAllEnvs());
it('rejects a foreign origin before authentication or a financial command',async()=>{
 const r=await PATCH(new Request(base,{method:'PATCH',headers:{origin:'https://foreign.test','Content-Type':'application/json'},body:'{}'}),ctx);
 expect(r.status).toBe(403);expect(m.actor).not.toHaveBeenCalled();expect(m.change).not.toHaveBeenCalled();
});
it('requires authentication and rejects duplicate query keys',async()=>{
 expect((await GET(new Request(base+'?page=1&page=2'),ctx)).status).toBe(422);expect(m.get).not.toHaveBeenCalled();
 m.actor.mockRejectedValue(new DomainError('Sign in',401));expect((await GET(new Request(base),ctx)).status).toBe(401);
});
it('passes exact scope/actor and preserves private not-found/version failures',async()=>{
 expect((await GET(new Request(base+'?scope=HISTORY&page=2'),ctx)).status).toBe(200);expect(m.get).toHaveBeenCalledWith(actor,id,{scope:'HISTORY',page:'2'});
 m.change.mockRejectedValue(new DomainError('Refresh the owner review.',409));const r=await PATCH(new Request(base,{method:'PATCH',headers:{origin:base,'Content-Type':'application/json'},body:'{"action":"REVIEW_OWNER_ALLOCATION"}'}),ctx);expect(r.status).toBe(409);expect(m.limit).toHaveBeenCalledWith('owner:owner-allocations',40);
 m.get.mockRejectedValue(new DomainError('Not found',404));expect((await GET(new Request(base),ctx)).status).toBe(404);
});
