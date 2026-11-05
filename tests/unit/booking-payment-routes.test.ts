import { beforeEach,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({actor:vi.fn(),limit:vi.fn(),authorize:vi.fn(),attach:vi.fn(),store:vi.fn(),remove:vi.fn(),read:vi.fn(),load:vi.fn(),get:vi.fn(),change:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireActor:mocks.actor}));vi.mock("@/lib/rate-limit",()=>({rateLimit:mocks.limit}));vi.mock("@/lib/storage",()=>({storeFile:mocks.store,removeOrphan:mocks.remove,loadFile:mocks.load}));
vi.mock("@/modules/bookings/payment",()=>({authorizePaymentEvidence:mocks.authorize,attachPaymentEvidence:mocks.attach,paymentEvidenceForRead:mocks.read,paymentGcashQrForRead:mocks.read,getPayments:mocks.get,changePayment:mocks.change}));
import { POST } from "../../src/app/api/booking-requests/[id]/payments/evidence/route";
import { GET as fileGET } from "../../src/app/api/booking-payment-files/[id]/route";
import { GET,PATCH } from "../../src/app/api/booking-requests/[id]/payments/route";
import { GET as qrGET } from "../../src/app/api/booking-requests/[id]/payments/gcash-qr/route";
import { DomainError } from "../../src/modules/partners/workflow";
const id="e79318ab-a56e-4cc8-a8b0-a3e4676d7b36",ctx={params:Promise.resolve({id})};
beforeEach(()=>{vi.resetAllMocks();process.env.APP_ORIGIN="http://localhost:3100";process.env.STORAGE_DRIVER="local";mocks.actor.mockResolvedValue({id:"renter",role:"RENTER"});mocks.authorize.mockResolvedValue({alreadyApplied:false});mocks.attach.mockResolvedValue({state:{status:"AGREEMENT_SIGNED"},usedFile:true});mocks.remove.mockResolvedValue(undefined);});
function upload(changes:Record<string,string>={}){const f=new FormData();for(const [k,v] of Object.entries({version:"2",idempotencyKey:id,agreementId:id,digest:"a".repeat(64),amountCentavos:"100",reference:"SYNTHETIC",...changes}))f.append(k,v);f.append("file",new File([new Uint8Array([137,80,78,71,13,10,26,10,0])],"synthetic.png",{type:"image/png"}));return new Request("http://localhost:3100/api/payments",{method:"POST",headers:{origin:"http://localhost:3100"},body:f});}
it("rejects extra/duplicate fields, invalid amounts, origins and oversized forms before storage",async()=>{
 for(const c of [{actorId:"foreign"},{amountCentavos:"0"},{version:"1.2"}] as Record<string,string>[])expect((await POST(upload(c),ctx)).status).toBe(422);
 const r=upload();r.headers.set("origin","https://foreign.example");expect((await POST(r,ctx)).status).toBe(403);
 const large=upload();large.headers.set("content-length",String(5.25*1024*1024+1));expect((await POST(large,ctx)).status).toBe(413);expect(mocks.store).not.toHaveBeenCalled();
});
it("authorizes with file SHA before storage, rechecks after storage and cleans unused retry objects",async()=>{
 mocks.attach.mockResolvedValue({state:{status:"AGREEMENT_SIGNED"},usedFile:false});expect((await POST(upload(),ctx)).status).toBe(201);
 expect(mocks.authorize.mock.calls[0][3]).toMatch(/^[a-f0-9]{64}$/);expect(mocks.authorize.mock.invocationCallOrder[0]).toBeLessThan(mocks.store.mock.invocationCallOrder[0]);expect(mocks.remove).toHaveBeenCalledWith(mocks.store.mock.calls[0][0]);
 expect(mocks.attach.mock.calls[0][3]).toMatchObject({mime:"image/png",size:9,backend:"local"});
});
it("skips storage for already-applied upload and cleans new orphan on version/suspension race",async()=>{
 mocks.authorize.mockResolvedValue({alreadyApplied:true,state:{status:"PAYMENT_PARTIAL"}});const replay=await POST(upload(),ctx);expect(await replay.json()).toEqual({status:"PAYMENT_PARTIAL"});expect(mocks.store).not.toHaveBeenCalled();
 mocks.authorize.mockResolvedValue({alreadyApplied:false});mocks.attach.mockRejectedValue(new DomainError("Request changed",409));expect((await POST(upload(),ctx)).status).toBe(409);expect(mocks.remove).toHaveBeenCalledWith(mocks.store.mock.calls[0][0]);
});
it("returns fresh state after successful attached upload without deleting its object",async()=>{expect((await POST(upload(),ctx)).status).toBe(201);expect(mocks.remove).not.toHaveBeenCalled();expect(mocks.store.mock.calls[0][0]).not.toBe(`${id}/${id}`);});
it("protects private bytes and emits restrictive same-origin download headers",async()=>{
 mocks.read.mockResolvedValue({objectKey:`${id}/${id}`,backend:"local",mime:"application/pdf",name:`payment-${id}.pdf`});mocks.load.mockResolvedValue(Buffer.from("%PDF-test"));const r=await fileGET(new Request("http://localhost/api/file"),ctx);expect(await r.text()).toBe("%PDF-test");expect(r.headers.get("cache-control")).toBe("private, no-store");expect(r.headers.get("content-security-policy")).toContain("sandbox");expect(r.headers.get("cross-origin-resource-policy")).toBe("same-origin");expect(r.headers.get("x-content-type-options")).toBe("nosniff");
 mocks.read.mockRejectedValue(new DomainError("Not found",404));mocks.load.mockClear();expect((await fileGET(new Request("http://localhost/api/file"),ctx)).status).toBe(404);expect(mocks.load).not.toHaveBeenCalled();
});
it("GET is read-only and JSON mutations enforce same-origin before dispatching exact commands",async()=>{
 mocks.get.mockResolvedValue({status:"AGREEMENT_SIGNED"});expect((await GET(new Request("http://localhost/api"),ctx)).status).toBe(200);
 const command={action:"RESOLVE_DEMO",version:2,idempotencyKey:id,attemptId:id,outcome:"APPROVED"};mocks.change.mockResolvedValue({status:"READY_FOR_SERVICE"});const r=await PATCH(new Request("http://localhost/api",{method:"PATCH",headers:{origin:"http://localhost:3100","content-type":"application/json"},body:JSON.stringify(command)}),ctx);expect(r.status).toBe(200);expect(mocks.change).toHaveBeenCalledWith({id:"renter",role:"RENTER"},id,command);
});
it("serves only participant-authorized saved GCash QR with private download headers",async()=>{
 mocks.read.mockResolvedValue({objectKey:`${id}/${id}`,backend:"local",mime:"image/png",name:`gcash-qr-${id}.png`});mocks.load.mockResolvedValue(Buffer.from("synthetic QR"));const r=await qrGET(new Request("http://localhost/api/qr"),ctx);expect(await r.text()).toBe("synthetic QR");expect(r.headers.get("cache-control")).toBe("private, no-store");expect(r.headers.get("cross-origin-resource-policy")).toBe("same-origin");
 mocks.read.mockRejectedValue(new DomainError("Not found",404));mocks.load.mockClear();expect((await qrGET(new Request("http://localhost/api/qr"),ctx)).status).toBe(404);expect(mocks.load).not.toHaveBeenCalled();
});
