"use client";
import {NotificationPanel} from './notification-panel';
import {useEffect,useRef,useState} from 'react';
import {usePathname} from 'next/navigation';
import {Bell} from 'lucide-react';
export function NotificationBell({userId,onNavigate}:{userId:string;onNavigate?:()=>void}){
 const [open,setOpen]=useState(false),container=useRef<HTMLDivElement>(null),button=useRef<HTMLButtonElement>(null);
 const path=usePathname(),[snapshot,setSnapshot]=useState<{userId:string;unread:number}|null>(null),refresh=useRef<()=>void>(()=>{});
 useEffect(()=>{
  let active=true,pending=false,controller:AbortController|undefined;
  setSnapshot(null);
  const load=async()=>{
   if(!active||pending||document.visibilityState==='hidden')return;
   pending=true;controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),10000);
   try{const response=await fetch('/api/notifications/count',{cache:'no-store',signal:controller.signal});if(!active)return;
    if([401,403].includes(response.status)){setSnapshot(null);setOpen(false);return;}
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
 useEffect(()=>{refresh.current();setOpen(false);const hash=()=>{if(window.location.hash==='#notifications')setOpen(true);};hash();window.addEventListener('hashchange',hash);return()=>window.removeEventListener('hashchange',hash);},[path,userId]);
 function close(focus=false){setOpen(false);if(window.location.hash==='#notifications')history.replaceState(null,'',window.location.pathname+window.location.search);if(focus)button.current?.focus();}
 useEffect(()=>{if(!open)return;const outside=(e:PointerEvent)=>{if(!container.current?.contains(e.target as Node)){setOpen(false);if(window.location.hash==='#notifications')history.replaceState(null,'',window.location.pathname+window.location.search);}};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[open]);
 const count=snapshot?.userId===userId?snapshot.unread:null,label=count===null?'Notifications':count>0?`Notifications (${count} unread)`:'Notifications (all read)';
 return <div className="notification-center" ref={container} onKeyDown={e=>{if(e.key==='Escape'&&open){e.stopPropagation();close(true);}}} onBlur={e=>{if(e.relatedTarget&&!e.currentTarget.contains(e.relatedTarget))close();}}>
  <button type="button" ref={button} className="notification-bell" onClick={()=>{if(open)close();else{onNavigate?.();setOpen(true);}}} aria-label={label} title={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={open?'notification-panel':undefined}>
   <Bell size={21} aria-hidden="true"/>{count!==null&&count>0&&<span className="notification-dot" aria-hidden="true"/>}
   <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{count===null?'':count>0?`${count} unread notifications`:'All notifications are read'}</span>
  </button>
  {open&&<NotificationPanel key={userId} close={()=>close(true)} fullHref={path.match(/^\/agency\/[a-f0-9-]{36}(?=\/|$)/i)?.[0].concat('/notifications')}/>}
 </div>;
}
