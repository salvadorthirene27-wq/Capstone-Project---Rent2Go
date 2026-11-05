import {it,expect,vi,afterEach} from "vitest";
const state=vi.hoisted(()=>({config:{systemClockOffset:0},send:vi.fn(),query:vi.fn()}));
vi.mock("@aws-sdk/client-s3",()=>{
 class Command{constructor(public input:unknown){}}
 return {S3Client:class{config=state.config;send=state.send;},PutObjectCommand:Command,GetObjectCommand:Command,DeleteObjectCommand:Command};
});
vi.mock("../../src/lib/db",()=>({db:{query:state.query}}));
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();state.query.mockReset();state.send.mockReset();state.config.systemClockOffset=0;});
it("corrects signing for private upload, read and orphan removal before the SDK sends bytes",async()=>{
 vi.resetModules();vi.stubEnv("STORAGE_DRIVER","s3");vi.spyOn(Date,"now").mockReturnValue(1000);
 state.query.mockResolvedValue({rows:[{now:new Date(3_601_000)}]});
 state.send.mockImplementation(async()=>{expect(state.config.systemClockOffset).toBeGreaterThanOrEqual(3_600_000);return {Body:{transformToByteArray:async()=>new Uint8Array([1,2,3])}};});
 const storage=await import("../../src/lib/storage");await storage.storeFile("a/b",new Uint8Array([1,2,3]),"image/png");expect(await storage.loadFile("a/b","s3")).toEqual(Buffer.from([1,2,3]));await storage.removeOrphan("a/b");expect(state.send).toHaveBeenCalledTimes(3);expect(state.query).toHaveBeenCalledOnce();
});
it("does not send storage bytes if authoritative time cannot be obtained",async()=>{
 vi.resetModules();vi.stubEnv("STORAGE_DRIVER","s3");state.query.mockRejectedValue(Error("clock unavailable"));
 const storage=await import("../../src/lib/storage");await expect(storage.storeFile("a/b",new Uint8Array([1]),"image/png")).rejects.toThrow("clock unavailable");expect(state.send).not.toHaveBeenCalled();
});
