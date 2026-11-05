import {beforeEach,afterEach,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({actor:vi.fn(),limit:vi.fn(),get:vi.fn(),change:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireActor:m.actor}));vi.mock("@/lib/rate-limit",()=>({rateLimit:m.limit}));vi.mock("@/modules/bookings/cancellation",()=>({getCancellation:m.get,changeCancellation:m.change}));
import {GET,PATCH} from "../../src/app/api/booking-requests/[id]/cancellation/route";
import {DomainError} from "../../src/modules/partners/workflow";
const id="e79318ab-a56e-4cc8-a8b0-a3e4676d7b36",ctx={params:Promise.resolve({id})},actor={id:"renter",role:"RENTER"};
const req=(origin="http://localhost:3100",body="{}")=>new Request("http://localhost:3100/api",{method:"PATCH",headers:{origin,"Content-Type":"application/json"},body});
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("APP_ORIGIN","http://localhost:3100");m.actor.mockResolvedValue(actor);m.get.mockResolvedValue({pending:null});m.change.mockResolvedValue({status:"CANCELLED"});});afterEach(()=>vi.unstubAllEnvs());
it("rejects foreign origin before actor/action and preserves domain version conflicts",async()=>{
 expect((await PATCH(req("https://foreign.test"),ctx)).status).toBe(403);expect(m.change).not.toHaveBeenCalled();m.change.mockRejectedValue(new DomainError("Request changed",409));const r=await PATCH(req(),ctx);expect(r.status).toBe(409);expect(await r.json()).toMatchObject({error:"Request changed"});
});
it("requires authentication, scopes reads and sends bounded JSON through the validated service",async()=>{
 expect((await GET(new Request("http://localhost:3100"),ctx)).status).toBe(200);expect(m.get).toHaveBeenCalledWith(actor,id);expect((await PATCH(req("http://localhost:3100",'{"action":"REQUEST_CANCELLATION"}'),ctx)).status).toBe(200);expect(m.change).toHaveBeenCalledWith(actor,id,{action:"REQUEST_CANCELLATION"});m.actor.mockRejectedValue(new DomainError("Sign in",401));expect((await GET(new Request("http://localhost:3100"),ctx)).status).toBe(401);
});
