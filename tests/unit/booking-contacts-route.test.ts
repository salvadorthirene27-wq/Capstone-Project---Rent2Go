import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {DomainError} from '../../src/modules/partners/workflow';
import {contactCommand,contactPage} from '../../src/modules/bookings/contact-schema';
const m=vi.hoisted(()=>({actor:vi.fn(),limit:vi.fn(),get:vi.fn(),save:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireActor:m.actor}));vi.mock('@/lib/rate-limit',()=>({rateLimit:m.limit}));vi.mock('@/modules/bookings/contacts',()=>({getBookingContacts:m.get,saveBookingContact:m.save}));
import {GET,PATCH} from '../../src/app/api/booking-requests/[id]/contacts/route';
const ctx={params:Promise.resolve({id:'request'})},base='http://localhost:3100/api/booking-requests/request/contacts';
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('APP_ORIGIN','http://localhost:3100');m.actor.mockResolvedValue({id:'agency',role:'AGENCY_ADMIN'});m.get.mockResolvedValue({history:[]});m.save.mockResolvedValue({version:2});});afterEach(()=>vi.unstubAllEnvs());
it('requires authentication, preserves access errors and returns uncached internal data',async()=>{
 m.actor.mockRejectedValueOnce(new DomainError('Sign in.',401));expect((await GET(new Request(base),ctx)).status).toBe(401);expect(m.get).not.toHaveBeenCalled();m.get.mockRejectedValueOnce(new DomainError('Request not found.',404));expect((await GET(new Request(base),ctx)).status).toBe(404);const r=await GET(new Request(base+'?page=2'),ctx);expect(r.status).toBe(200);expect(r.headers.get('Cache-Control')).toBe('no-store');expect(m.get.mock.calls.at(-1)?.[2]).toEqual({page:'2'});
});
it('rejects wrong origins, repeated filters, query-bearing saves and unsupported content before mutation',async()=>{
 expect((await PATCH(new Request(base,{method:'PATCH',headers:{Origin:'https://foreign.example','Content-Type':'application/json'},body:'{}'}),ctx)).status).toBe(403);
 expect((await GET(new Request(base+'?page=1&page=2'),ctx)).status).toBe(422);
 expect((await PATCH(new Request(base+'?page=1',{method:'PATCH',headers:{Origin:'http://localhost:3100','Content-Type':'application/json'},body:'{}'}),ctx)).status).toBe(422);
 expect((await PATCH(new Request(base,{method:'PATCH',headers:{Origin:'http://localhost:3100','Content-Type':'text/plain'},body:'{}'}),ctx)).status).toBe(415);expect(m.save).not.toHaveBeenCalled();
});
it('validates bounded history filters and prevents clients adding contact facts to an assignment',()=>{
 expect(contactPage.safeParse({page:0}).success).toBe(false);expect(contactPage.safeParse({staff:'all'}).success).toBe(false);
 const plan={action:'ASSIGNMENT',version:1,idempotencyKey:'04f8c9b9-39fd-458d-9b3d-d60e8d0ad631',assigneeId:null,nextFollowUpAt:null,note:'Plan a follow-up.'};
 expect(contactCommand.safeParse(plan).success).toBe(true);expect(contactCommand.safeParse({...plan,method:'PHONE'}).success).toBe(false);expect(contactCommand.safeParse({...plan,actorId:'foreign'}).success).toBe(false);
 expect(contactCommand.safeParse({...plan,action:'CONTACT',method:'PHONE',outcome:'REACHED'}).success).toBe(false);
});
