"use client";
import Link from 'next/link';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Bell,Check,Trash2,Undo2,X} from 'lucide-react';
import {FullNotificationInbox} from './full-notification-inbox';
import type {NotificationInbox} from '@/modules/notifications/service';
import {notificationLabels} from '@/modules/notifications/presentation';
import {date} from '@/modules/partners/presentation';

type Query=NotificationInbox['filters'];
type Command=Record<string,unknown>;
const initialQuery:Query={status:'ALL',category:'ALL',page:1};
export function NotificationPanel({close,initial,fullHref='/workspace/notifications'}:{close?:()=>void;initial?:NotificationInbox;fullHref?:string}){
 const full=initial!==undefined;
 const [data,setData]=useState<NotificationInbox|null>(initial??null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[undo,setUndo]=useState<string|null>(null),[retry,setRetry]=useState<Command|null>(null);
 const active=useRef(true),pending=useRef(false),request=useRef<AbortController|null>(null),query=useRef(initial?.filters??initialQuery),closeButton=useRef<HTMLButtonElement>(null);
 const load=useCallback(async(filters:Query,command?:Command,automatic=false)=>{
  if(pending.current||!active.current)return;
  pending.current=true;setBusy(true);if(!automatic)setError('');const abort=new AbortController();request.current=abort;const timer=setTimeout(()=>abort.abort(),10000);
  try{
   const params=new URLSearchParams({status:filters.status,category:filters.category,page:String(filters.page)});
   if(filters.search)params.set('search',filters.search);
   const response=await fetch(command?'/api/notifications':`/api/notifications?${params}`,{cache:'no-store',signal:abort.signal,...(command?{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)}:{})}),body=await response.json();
   if(!active.current)return;
   if(!response.ok){if([401,403].includes(response.status)){setData(null);setUndo(null);}throw Error(body.error??'Unable to load notifications.');}
   const inbox:NotificationInbox=command&&'action' in command?body.inbox:body;
   query.current=inbox.filters;setData(inbox);if(!automatic){setError('');setRetry(null);}
   if(command){setUndo(body.undoId??null);setNotice('action' in command?`${body.affected} ${body.affected===1?'notification':'notifications'} ${String(command.action).startsWith('DELETE')?'deleted':String(command.action).startsWith('RESTORE')?'restored':'marked as read'}.`:'Notification marked as read.');
    window.dispatchEvent(new Event('rent2go:notifications-changed'));try{localStorage.setItem('rent2go:notification-read',String(Date.now()));}catch{/* The current tab still updates. */}
   }
  }catch(e){if(active.current){setError(e instanceof Error&&e.name!=='AbortError'?e.message:'Connection interrupted. Refresh or retry the same action.');if(command)setRetry(command);}}
  finally{clearTimeout(timer);pending.current=false;if(active.current)setBusy(false);}
 },[]);
 useEffect(()=>{
  active.current=true;closeButton.current?.focus();if(!full)void load(initialQuery);
  const refresh=()=>{if(document.visibilityState!=='hidden')void load(query.current,undefined,true);};
  const storage=(e:StorageEvent)=>{if(e.key==='rent2go:notification-read')refresh();};
  const timer=setInterval(refresh,30000);window.addEventListener('focus',refresh);window.addEventListener('storage',storage);document.addEventListener('visibilitychange',refresh);
  return()=>{active.current=false;request.current?.abort();clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('storage',storage);document.removeEventListener('visibilitychange',refresh);};
 },[load,full]);
 function action(action:string,extra:Command={}){void load(query.current,{action,...extra,idempotencyKey:crypto.randomUUID(),query:query.current});}
 const feedback=<div className="notification-feedback" aria-live="polite">{notice&&<p role="status">{notice} {undo&&<button type="button" disabled={busy||!!retry} onClick={()=>action('RESTORE_BATCH',{batchId:undo})}><Undo2 size={15} aria-hidden="true"/>Undo</button>}</p>}{error&&<p role="alert">{error} <button type="button" disabled={busy} onClick={()=>void load(query.current,retry??undefined)}>{retry?'Retry action':'Refresh'}</button>{retry&&<button type="button" disabled={busy} onClick={()=>{setRetry(null);void load(query.current);}}>Check inbox</button>}</p>}</div>;
 const paginate=(page:number)=>void load({...query.current,page});
 const pagination=data&&data.pageCount>1&&<div className="notification-pagination"><button type="button" disabled={busy||!!retry||data.filters.page<=1} onClick={()=>paginate(data.filters.page-1)}>Previous</button><span>{data.filters.page} / {data.pageCount}</span><button type="button" disabled={busy||!!retry||data.filters.page>=data.pageCount} onClick={()=>paginate(data.filters.page+1)}>Next</button></div>;
 if(full)return <FullNotificationInbox data={data} disabled={busy||!!retry} busy={busy} feedback={feedback} pagination={pagination}
  onFilter={filters=>void load({...query.current,...filters,page:1})} onAction={action}
  onRead={item=>void load(query.current,{items:[item],query:query.current})}/>;
 return <section id="notification-panel" className="notification-panel" role="dialog" aria-modal="false" aria-labelledby="notification-heading" aria-busy={busy}>
  <div className="notification-panel-heading"><div><h2 id="notification-heading">Notifications</h2><p>{data?`${data.unread} unread`:'Your latest updates'}</p></div><button ref={closeButton} type="button" className="notification-icon" onClick={close} aria-label="Close notifications"><X size={20} aria-hidden="true"/></button></div>
  <div className="notification-panel-toolbar">
   <div className="notification-filters" role="group" aria-label="Filter notifications">{(['ALL','UNREAD','DELETED'] as const).map(status=><button key={status} type="button" aria-pressed={data?.filters.status===status} disabled={busy||!!retry} onClick={()=>void load({...query.current,status,page:1})}>{status==='ALL'?'All':status==='UNREAD'?'Unread':'Deleted'}</button>)}</div>
   {data?.filters.status!=='DELETED'&&<div className="notification-bulk-actions"><button type="button" disabled={busy||!!retry||!data?.unread} onClick={()=>action('MARK_ALL_READ')}><Check size={16} aria-hidden="true"/>Mark all as read</button><button type="button" disabled={busy||!!retry||!data} onClick={()=>action('DELETE_READ')}><Trash2 size={16} aria-hidden="true"/>Delete read</button></div>}
  </div>
  {feedback}
  <div className="notification-panel-list">
   {!data&&!error&&<p className="notification-empty">Loading notifications…</p>}
   {data&&!data.items.length&&<div className="notification-empty"><Bell size={26} aria-hidden="true"/><p>{data.filters.status==='DELETED'?'No deleted notifications.':data.filters.status==='UNREAD'?'You’re all caught up.':'No notifications yet.'}</p></div>}
   {data?.items.map(item=><article key={`${item.source}:${item.id}`} className={`notification-item${!item.readAt?' is-unread':''}`}>
    <span className="notification-kind" aria-hidden="true"><Bell size={18}/></span><div className="notification-item-body"><p className="notification-meta">{notificationLabels[item.source]}{!item.readAt&&<span className="notification-unread-label">Unread</span>}</p><p>{item.message}</p><time dateTime={item.createdAt}>{date(item.createdAt)}</time>
     <div className="notification-item-actions">{item.link&&<Link href={item.link} onClick={close}>View details</Link>}{data.filters.status==='DELETED'?<button type="button" disabled={busy||!!retry} onClick={()=>action('RESTORE_ONE',{item:{source:item.source,id:item.id}})}>Restore</button>:!item.readAt&&<button type="button" disabled={busy||!!retry} onClick={()=>void load(query.current,{items:[{source:item.source,id:item.id}],query:query.current})}>Mark as read</button>}</div>
    </div>{data.filters.status!=='DELETED'&&<button type="button" className="notification-icon" disabled={busy||!!retry} aria-label={`Delete notification: ${notificationLabels[item.source]}`} onClick={()=>action('DELETE_ONE',{item:{source:item.source,id:item.id}})}><Trash2 size={17} aria-hidden="true"/></button>}
   </article>)}
  </div>
  <div className="notification-panel-footer">{pagination}<div className="notification-panel-links"><Link href={fullHref} onClick={close}>View all notifications</Link><Link href="/workspace/account#notification-preferences" onClick={close}>Preferences</Link></div></div>
 </section>;
}
