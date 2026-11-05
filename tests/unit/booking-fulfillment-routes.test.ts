import {beforeEach,afterEach,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({actor:vi.fn(),limit:vi.fn(),authorize:vi.fn(),attach:vi.fn(),read:vi.fn(),get:vi.fn(),change:vi.fn(),store:vi.fn(),remove:vi.fn(),load:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireActor:m.actor}));vi.mock("@/lib/rate-limit",()=>({rateLimit:m.limit}));vi.mock("@/lib/storage",()=>({storeFile:m.store,removeOrphan:m.remove,loadFile:m.load}));vi.mock("@/modules/bookings/fulfillment",()=>({authorizeInspectionUpload:m.authorize,attachInspectionPhoto:m.attach,inspectionPhotoForRead:m.read,getFulfillment:m.get,changeFulfillment:m.change}));
import {POST} from "../../src/app/api/booking-requests/[id]/fulfillment/photos/route";
import {GET as photoGET} from "../../src/app/api/inspection-photos/[id]/route";
import {PATCH} from "../../src/app/api/booking-requests/[id]/fulfillment/route";
import {DomainError} from "../../src/modules/partners/workflow";
const id="e79318ab-a56e-4cc8-a8b0-a3e4676d7b36",ctx={params:Promise.resolve({id})};
function request(extra:Record<string,string>={},mime="image/png"){const f=new FormData();for(const [k,v] of Object.entries({lineId:id,phase:"PRE",version:"1",...extra}))f.append(k,v);f.append("file",new File([mime==="application/pdf"?Buffer.from("%PDF-1.4"):new Uint8Array([137,80,78,71,13,10,26,10,0])],"synthetic.png",{type:mime}));return new Request("http://localhost:3100/api",{method:"POST",headers:{origin:"http://localhost:3100"},body:f});}
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("APP_ORIGIN","http://localhost:3100");vi.stubEnv("STORAGE_DRIVER","local");m.actor.mockResolvedValue({id:"operator",role:"AGENCY_ADMIN"});m.attach.mockResolvedValue({requestVersion:2});m.remove.mockResolvedValue(undefined);});afterEach(()=>vi.unstubAllEnvs());
it("rejects foreign origin, extra fields, PDFs and oversized multipart before writing storage",async()=>{
 const bad=request();bad.headers.set("origin","https://foreign.test");expect((await POST(bad,ctx)).status).toBe(403);expect((await POST(request({actorId:id}),ctx)).status).toBe(422);expect((await POST(request({},"application/pdf"),ctx)).status).toBe(422);const large=request();large.headers.set("content-length",String(6*1024*1024));expect((await POST(large,ctx)).status).toBe(413);expect(m.store).not.toHaveBeenCalled();
});
it("checks upload authority on both sides of storage and removes an orphan after stale attachment",async()=>{
 m.attach.mockRejectedValue(new DomainError("Request changed",409));expect((await POST(request(),ctx)).status).toBe(409);expect(m.authorize.mock.invocationCallOrder[0]).toBeLessThan(m.store.mock.invocationCallOrder[0]);expect(m.store.mock.invocationCallOrder[0]).toBeLessThan(m.attach.mock.invocationCallOrder[0]);expect(m.remove).toHaveBeenCalledWith(m.store.mock.calls[0][0]);expect(m.attach.mock.calls[0][5]).toMatchObject({mime:"image/png",size:9,backend:"local"});
});
it("does not store bytes when authorization is denied and retains only successfully attached evidence",async()=>{
 m.authorize.mockRejectedValueOnce(new DomainError("No access",403));expect((await POST(request(),ctx)).status).toBe(403);expect(m.store).not.toHaveBeenCalled();expect((await POST(request(),ctx)).status).toBe(201);expect(m.remove).not.toHaveBeenCalled();
});
it("authorizes private photo reads before storage access and returns restrictive same-origin headers",async()=>{
 m.read.mockRejectedValueOnce(new DomainError("Not found",404));expect((await photoGET(new Request("http://localhost/api"),ctx)).status).toBe(404);expect(m.load).not.toHaveBeenCalled();m.read.mockResolvedValue({objectKey:`${id}/${id}`,backend:"local",mime:"image/png",name:"inspection.png"});m.load.mockResolvedValue(Buffer.from("synthetic"));const r=await photoGET(new Request("http://localhost/api"),ctx);expect(await r.text()).toBe("synthetic");expect(r.headers.get("cache-control")).toBe("private, no-store");expect(r.headers.get("x-content-type-options")).toBe("nosniff");expect(r.headers.get("content-security-policy")).toContain("sandbox");expect(r.headers.get("cross-origin-resource-policy")).toBe("same-origin");
});
it("enforces origin before dispatching a fulfillment JSON command",async()=>{
 const command={action:"COMPLETE_TOUR",version:1,idempotencyKey:id,lineId:id,note:"Synthetic completion"};m.change.mockResolvedValue({status:"SERVICE_ACTIVE"});const req=new Request("http://localhost/api",{method:"PATCH",headers:{origin:"http://localhost:3100","content-type":"application/json"},body:JSON.stringify(command)});expect((await PATCH(req,ctx)).status).toBe(200);expect(m.change).toHaveBeenCalledWith({id:"operator",role:"AGENCY_ADMIN"},id,command);
});
