"use client";
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import type {AccountScope} from '@/modules/accounting/schema';
import type {OwnerAccountState} from '@/modules/accounting/owner-accounts';
export function useOwnerAccount(scope:AccountScope){
 const url=`/api/owner-accounts/${scope.agencyId}/${encodeURIComponent(scope.ownerId)}`,target=`${url}?environment=${scope.environment}`,router=useRouter();
 const [data,setData]=useState<OwnerAccountState|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[stale,setStale]=useState(false);
 const alive=useRef(true),active=useRef(target),generation=useRef(0),saving=useRef(false),latest=useRef(data),retry=useRef<{fingerprint:string;command:Record<string,unknown>}|null>(null);active.current=target;latest.current=data;
 async function load(page=latest.current?.page??1,ledgerPage=latest.current?.ledgerPage??1){const token=++generation.current;setLoading(true);setError('');try{const r=await fetch(`${target}&page=${page}&ledgerPage=${ledgerPage}`,{cache:'no-store'}),body=await r.json();if(!r.ok)throw Error(body.error??'Unable to load owner earnings.');if(alive.current&&active.current===target&&token===generation.current){setData(body);setStale(false);retry.current=null;}}catch(e){if(alive.current&&active.current===target&&token===generation.current){setError(e instanceof Error?e.message:'Unable to load owner earnings.');setStale(true);}}finally{if(alive.current&&active.current===target&&token===generation.current)setLoading(false);}}
 const reload=useRef(load);reload.current=load;
 useEffect(()=>{alive.current=true;saving.current=false;setBusy(false);setData(null);setMessage('');retry.current=null;void load(1,1);const focus=()=>{if(!saving.current)void reload.current();};window.addEventListener('focus',focus);return()=>{alive.current=false;generation.current++;window.removeEventListener('focus',focus);};},[target]);
 async function send(value:Record<string,unknown>,file?:File){if(!latest.current||saving.current||loading||stale)return;const version=latest.current.requestVersion;saving.current=true;generation.current++;setBusy(true);setError('');setMessage('');try{
  const hash=file?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join(''):'';
  if(!alive.current||active.current!==target)return;
  const command={...value,version},fingerprint=JSON.stringify({target,command,hash});if(retry.current?.fingerprint!==fingerprint)retry.current={fingerprint,command:{...command,idempotencyKey:crypto.randomUUID()}};
  const body=file?new FormData():JSON.stringify(retry.current.command);if(file&&body instanceof FormData){for(const [key,v]of Object.entries(retry.current.command))body.append(key,String(v));body.append('file',file);}
  const r=await fetch(file?`${url}/evidence?environment=${scope.environment}`:target,{method:file?'POST':'PATCH',...(file?{}:{headers:{'Content-Type':'application/json'}}),body}),result=await r.json();if(!r.ok){if(r.status===409&&alive.current&&active.current===target)setStale(true);throw Error(result.error??'Unable to save the withdrawal action.');}
  if(alive.current&&active.current===target){setData(result);retry.current=null;setStale(false);setMessage('Withdrawal action recorded. Check the current request and payout status.');router.refresh();}
 }catch(e){if(alive.current&&active.current===target)setError(e instanceof Error?e.message:'Unable to save the withdrawal action.');}finally{if(alive.current&&active.current===target){saving.current=false;setBusy(false);}}}
 return {data,error,message,loading,busy,stale,blocked:loading||busy||stale,load,send};
}
