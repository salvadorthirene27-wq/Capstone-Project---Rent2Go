"use client";
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {usePathname} from 'next/navigation';
import {Bell} from 'lucide-react';
export function NotificationBell({userId,onNavigate}:{userId:string;onNavigate?:()=>void}){
 const path=usePathname(),[snapshot,setSnapshot]=useState<{userId:string;unread:number}|null>(null),refresh=useRef<()=>void>(()=>{});
 useEffect(()=>{
  let active=true,pending=false,controller:AbortController|undefined;
  setSnapshot(null);
  const load=async()=>{
   if(!active||pending||document.visibilityState==='hidden')return;
   pending=true;controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),10000);
   try{const response=await fetch('/api/notifications/count',{cache:'no-store',signal:controller.signal});if(!active)return;
    if([401,403].includes(response.status)){setSnapshot(null);return;}
    if(!response.ok)return;const body=await response.json();
    if(active&&body.actorId===userId&&Number.isSafeInteger(body.unread)&&body.unread>=0)setSnapshot({userId,unread:body.unread});
   }catch{/* Keep the last confirmed count through a temporary interruption. */}
   finally{clearTimeout(timeout);pending=false;}
  };
  refresh.current=()=>{void load();};const changed=()=>refresh.current(),storage=(event:StorageEvent)=>{if(event.key==='rent2go:notification-read')changed();};
  void load();const timer=setInterval(changed,30000);
  window.addEventListener('focus',changed);document.addEventListener('visibilitychange',changed);window.addEventListener('rent2go:notifications-changed',changed);window.addEventListener('storage',storage);
  return()=>{active=false;controller?.abort();clearInterval(timer);refresh.current=()=>{};window.removeEventListener('focus',changed);document.removeEventListener('visibilitychange',changed);window.removeEventListener('rent2go:notifications-changed',changed);window.removeEventListener('storage',storage);};
 },[userId]);
 useEffect(()=>refresh.current(),[path]);
 const count=snapshot?.userId===userId?snapshot.unread:null,label=count===null?'Notifications':count>0?`Notifications (${count} unread)`:'Notifications (all read)';
 return <Link href="/workspace/notifications" className="notification-bell" onClick={onNavigate} aria-label={label} title={label} aria-current={path==='/workspace/notifications'?'page':undefined}>
  <Bell size={21} aria-hidden="true"/>{count!==null&&count>0&&<span className="notification-dot" aria-hidden="true"/>}
  <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{count===null?'':count>0?`${count} unread notifications`:'All notifications are read'}</span>
 </Link>;
}
