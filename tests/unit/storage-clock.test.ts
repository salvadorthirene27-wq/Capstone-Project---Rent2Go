import {it,expect,vi} from "vitest";
import {createStorageSigningClock} from "../../src/lib/storage-clock";
it("anchors signing to server time while tolerating later wall-clock changes",async()=>{
 let wall=1_000,mono=0;const server=vi.fn().mockResolvedValue(3_601_000),offset=createStorageSigningClock(server,{wallNow:()=>wall,monotonicNow:()=>mono,maxAge:60000});
 expect(await offset()).toBe(3_600_000);mono=1_000;wall=7_202_000;
 expect(wall+await offset()).toBe(3_602_000);expect(server).toHaveBeenCalledOnce();
});
it("coalesces concurrent clock refreshes and samples again after monotonic expiry",async()=>{
 let mono=0,release!:(value:number)=>void;const server=vi.fn().mockImplementationOnce(()=>new Promise<number>(r=>release=r)).mockResolvedValueOnce(2000),offset=createStorageSigningClock(server,{wallNow:()=>0,monotonicNow:()=>mono,maxAge:60});
 const a=offset(),b=offset();release(1000);expect(await a).toBe(1000);expect(await b).toBe(1000);expect(server).toHaveBeenCalledOnce();
 mono=61;expect(await offset()).toBe(2000);expect(server).toHaveBeenCalledTimes(2);
});
it("fails closed on unavailable or invalid server time instead of signing with an incorrect laptop clock",async()=>{
 const server=vi.fn().mockRejectedValueOnce(Error("clock unavailable")).mockResolvedValueOnce(NaN).mockResolvedValueOnce(5000),offset=createStorageSigningClock(server,{wallNow:()=>100,monotonicNow:()=>0});
 await expect(offset()).rejects.toThrow("clock unavailable");await expect(offset()).rejects.toThrow("Invalid storage clock");expect(await offset()).toBe(4900);
});
