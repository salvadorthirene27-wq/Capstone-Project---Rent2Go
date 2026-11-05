/** Correct protocol signing without changing the machine clock or business timestamps. */
export function createStorageSigningClock(serverNow:()=>Promise<number>,options:{wallNow?:()=>number;monotonicNow?:()=>number;maxAge?:number}={}){
 const wallNow=options.wallNow??Date.now,monotonicNow=options.monotonicNow??(()=>performance.now()),maxAge=options.maxAge??60000;
 let anchor:{epoch:number;observedAt:number}|undefined,refresh:Promise<void>|undefined;
 return async()=>{
  if(!anchor||monotonicNow()-anchor.observedAt>=maxAge){
   refresh??=(async()=>{
    const epoch=await serverNow();
    if(!Number.isFinite(epoch))throw Error("Invalid storage clock");
    anchor={epoch,observedAt:monotonicNow()};
   })().finally(()=>{refresh=undefined;});
   await refresh;
  }
  return anchor!.epoch+monotonicNow()-anchor!.observedAt-wallNow();
 };
}
