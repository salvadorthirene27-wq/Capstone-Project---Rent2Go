import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({requireActor:vi.fn(),rateLimit:vi.fn(),authorize:vi.fn(),attach:vi.fn(),store:vi.fn(),remove:vi.fn(),read:vi.fn(),load:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireActor:mocks.requireActor}));
vi.mock("@/lib/rate-limit",()=>({rateLimit:mocks.rateLimit}));
vi.mock("@/lib/storage",()=>({storeFile:mocks.store,removeOrphan:mocks.remove,loadFile:mocks.load}));
vi.mock("@/modules/bookings/agreement",()=>({authorizeAgreementSignature:mocks.authorize,attachAgreementSignature:mocks.attach,bookingSignatureForRead:mocks.read}));
import { POST } from "../../src/app/api/booking-requests/[id]/agreement/sign/route";
import { GET } from "../../src/app/api/booking-signatures/[id]/route";
import { DomainError } from "../../src/modules/partners/workflow";
const id="e79318ab-a56e-4cc8-a8b0-a3e4676d7b36",context={params:Promise.resolve({id})};
beforeEach(()=>{vi.resetAllMocks();process.env.APP_ORIGIN="http://localhost:3100";process.env.STORAGE_DRIVER="local";mocks.requireActor.mockResolvedValue({id:"renter",role:"RENTER"});mocks.attach.mockResolvedValue({status:"AGREEMENT_SIGNED"});mocks.remove.mockResolvedValue(undefined);});
function request(changes:Record<string,string>={}){
 const f=new FormData();for(const [k,v] of Object.entries({version:"2",agreementId:id,digest:"a".repeat(64),signerName:"Synthetic renter",consent:"true",...changes}))f.append(k,v);
 f.append("file",new File([new Uint8Array([137,80,78,71,13,10,26,10,0])],"synthetic.png",{type:"image/png"}));return new Request("http://localhost:3100/api/sign",{method:"POST",headers:{origin:"http://localhost:3100"},body:f});
}
it("rejects absent explicit consent and extra client identity before storing",async()=>{
 expect((await POST(request({consent:"false"}),context)).status).toBe(422);
 expect((await POST(request({actorId:"someone"}),context)).status).toBe(422);expect(mocks.store).not.toHaveBeenCalled();
});
it("authorizes before storage, binds immutable metadata and cleans the orphan when post-storage recheck rejects",async()=>{
 mocks.attach.mockRejectedValue(new DomainError("Request changed",409));expect((await POST(request(),context)).status).toBe(409);
 expect(mocks.authorize).toHaveBeenCalledOnce();expect(mocks.store).toHaveBeenCalledOnce();expect(mocks.attach).toHaveBeenCalledOnce();expect(mocks.remove).toHaveBeenCalledWith(mocks.store.mock.calls[0][0]);
 expect(mocks.authorize.mock.invocationCallOrder[0]).toBeLessThan(mocks.store.mock.invocationCallOrder[0]);
});
it("returns 201 only after both checks and never cleans an attached signature",async()=>{
 expect((await POST(request(),context)).status).toBe(201);expect(mocks.remove).not.toHaveBeenCalled();
 expect(mocks.attach.mock.calls[0][3]).toMatchObject({mime:"image/png",size:9,backend:"local"});
});
it("never stores evidence when the current version/hold authorization fails",async()=>{
 mocks.authorize.mockRejectedValue(new DomainError("Hold expired",409));expect((await POST(request(),context)).status).toBe(409);expect(mocks.store).not.toHaveBeenCalled();expect(mocks.attach).not.toHaveBeenCalled();
});
it("rejects wrong origins and oversized multipart before authorization",async()=>{
 const wrong=request();wrong.headers.set("origin","https://foreign.example");expect((await POST(wrong,context)).status).toBe(403);
 const large=request();large.headers.set("content-length",String(1280*1024+1));expect((await POST(large,context)).status).toBe(413);expect(mocks.authorize).not.toHaveBeenCalled();expect(mocks.store).not.toHaveBeenCalled();
});
it("private file response preserves bytes and restrictive download headers",async()=>{
 const bytes=Buffer.from([137,80,78,71]);mocks.read.mockResolvedValue({objectKey:`${id}/${id}`,backend:"local",mime:"image/png",name:`signature-${id}.png`});mocks.load.mockResolvedValue(bytes);
 const r=await GET(new Request("http://localhost/api/file"),context);expect(Buffer.from(await r.arrayBuffer())).toEqual(bytes);
 expect(r.headers.get("cache-control")).toBe("private, no-store");expect(r.headers.get("x-content-type-options")).toBe("nosniff");expect(r.headers.get("content-security-policy")).toContain("sandbox");expect(r.headers.get("cross-origin-resource-policy")).toBe("same-origin");expect(r.headers.get("content-disposition")).toMatch(/^inline; filename="signature-/);
});
it("never loads private bytes for unauthorized signature reads",async()=>{
 mocks.read.mockRejectedValue(new DomainError("Signature not found",404));expect((await GET(new Request("http://localhost/api/file"),context)).status).toBe(404);expect(mocks.load).not.toHaveBeenCalled();
});
