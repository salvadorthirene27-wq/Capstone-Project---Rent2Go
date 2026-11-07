"use client";
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import type {RemittanceScope} from '@/modules/accounting/remittance-schema';
import type {RemittanceState} from '@/modules/accounting/remittances';
type Pages={sourcePage:number;creditPage:number;historyPage:number;creditHistoryPage:number};
export function useRemittanceAccount(scope:RemittanceScope){
 const url=`/api/remittances/${scope.agencyId}`,target=`${url}?environment=${scope.environment}`,router=useRouter(),[data,setData]=useState<RemittanceState|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[stale,setStale]=useState(false);
 const alive=useRef(true),active=useRef(target),latest=useRef(data),generation=useRef(0),saving=useRef(false),reading=useRef(false),controller=useRef<AbortController|null>(null),pages=useRef<Pages>({sourcePage:1,creditPage:1,historyPage:1,creditHistoryPage:1}),retry=useRef<{fingerprint:string;command:Record<string,unknown>}|null>(null);active.current=target;latest.current=data;
 async function load(next:Partial<Pages>={},quiet=false){
  if(saving.current||quiet&&reading.current)return;const token=++generation.current;controller.current?.abort();const request=new AbortController();controller.current=request;reading.current=true;pages.current={...pages.current,...next};if(!quiet)setLoading(true);setError('');
  try{const r=await fetch(`${target}&${new URLSearchParams(Object.fromEntries(Object.entries(pages.current).map(([k,v])=>[k,String(v)])))}`,{cache:'no-store',signal:request.signal}),body=await r.json();if(!r.ok){if([401,403,404].includes(r.status)&&alive.current&&active.current===target&&token===generation.current)setData(null);throw Error(body.error??'Unable to load remittance records.');}if(alive.current&&active.current===target&&token===generation.current){setData(body);latest.current=body;setStale(false);retry.current=null;}}
  catch(e){if(!request.signal.aborted&&alive.current&&active.current===target&&token===generation.current){setError(e instanceof Error?e.message:'Unable to load remittance records.');setStale(true);}}
  finally{if(alive.current&&active.current===target&&token===generation.current){reading.current=false;setLoading(false);}}
 }
 const reload=useRef(load);reload.current=load;
 useEffect(()=>{alive.current=true;saving.current=false;reading.current=false;setBusy(false);setData(null);setMessage('');retry.current=null;pages.current={sourcePage:1,creditPage:1,historyPage:1,creditHistoryPage:1};void load();const refresh=()=>{if(document.visibilityState==='visible'&&!saving.current)void reload.current({},true);};window.addEventListener('focus',refresh);const timer=setInterval(refresh,30000);return()=>{alive.current=false;generation.current++;controller.current?.abort();clearInterval(timer);window.removeEventListener('focus',refresh);};},[target]);
 async function send(value:Record<string,unknown>,file?:File):Promise<boolean>{
  if(!latest.current||saving.current||loading||stale)return false;
  if(file&&(file.size<1||file.size>5242880||!['image/png','image/jpeg','application/pdf'].includes(file.type))){setError('Choose PNG, JPEG or PDF evidence up to 5 MB.');return false;}
  const version=latest.current.requestVersion;saving.current=true;generation.current++;controller.current?.abort();setBusy(true);setError('');setMessage('');
  try{
   const hash=file?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join(''):'';if(!alive.current||active.current!==target)return false;
   const command={...value,version},fingerprint=JSON.stringify({target,command,hash});if(retry.current?.fingerprint!==fingerprint)retry.current={fingerprint,command:{...command,idempotencyKey:crypto.randomUUID()}};
   const body=file?new FormData():JSON.stringify(retry.current.command);if(file&&body instanceof FormData){for(const[k,v]of Object.entries(retry.current.command))body.append(k,String(v));body.append('file',file);}
   const r=await fetch(file?`${url}/evidence?environment=${scope.environment}`:target,{method:file?'POST':'PATCH',...(file?{}:{headers:{'Content-Type':'application/json'}}),body}),result=await r.json();if(!r.ok){if(alive.current&&active.current===target){if(r.status===409)setStale(true);if([401,403,404].includes(r.status))setData(null);}throw Error(result.error??'Unable to save this remittance action.');}
   if(alive.current&&active.current===target){setData(result);latest.current=result;setStale(false);setMessage('Remittance action saved. Review its current status below.');retry.current=null;pages.current={sourcePage:result.sources.page,creditPage:result.creditSources.page,historyPage:result.historyPage,creditHistoryPage:result.creditHistoryPage};router.refresh();}return true;
  }catch(e){if(alive.current&&active.current===target)setError(e instanceof Error?e.message:'Unable to save this remittance action.');return false;}
  finally{if(alive.current&&active.current===target){saving.current=false;reading.current=false;setBusy(false);}}
 }
 return {data,error,message,loading,busy,stale,blocked:loading||busy||stale,load,send};
}
