"use client";
import {useEffect,useRef,useState} from 'react';
import {Mail,RefreshCw} from 'lucide-react';
import Link from 'next/link';
import type {EmailSettings} from '@/modules/email/service';
import {date} from '@/modules/partners/presentation';

const statuses:Record<string,string>={QUEUED:'Queued',SENDING:'Sending',ACCEPTED:'Accepted by Gmail',REJECTED:'Rejected',UNKNOWN:'Outcome unconfirmed',CANCELLED:'Cancelled'};
export function EmailUpdates(){
 const [open,setOpen]=useState(false),[data,setData]=useState<EmailSettings|null>(null),[enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[ack,setAck]=useState(false);
 const active=useRef(true),pending=useRef(false),controller=useRef<AbortController|null>(null),retry=useRef<{id:string;key:string}|null>(null);
 useEffect(()=>{active.current=true;return()=>{active.current=false;controller.current?.abort();};},[]);
 async function load(command?:unknown,page=1){
  if(pending.current)return;pending.current=true;setBusy(true);setError('');setMessage('');const abort=new AbortController();controller.current=abort;
  try{
   const response=await fetch(`/api/notifications/email${command?'':`?page=${page}`}`,{method:command?'POST':'GET',...(command?{headers:{'Content-Type':'application/json'},body:JSON.stringify(command)}:{}),signal:abort.signal,cache:'no-store'}),body=await response.json();
   if(!active.current)return;if(!response.ok){if([401,403,404].includes(response.status))setData(null);throw Error(body.error??'Unable to load email preferences.');}
   setData(body);setEnabled(body.enabled);setAck(false);retry.current=null;
   if(command)setMessage('Your change is saved. Email delivery does not approve bookings or move money.');
  }catch(e){if(active.current&&!(e instanceof Error&&e.name==='AbortError'))setError(e instanceof Error?e.message:'Unable to load email preferences.');}
  finally{pending.current=false;if(active.current)setBusy(false);}
 }
 return <details className="email-settings" onToggle={e=>{const visible=e.currentTarget.open;setOpen(visible);if(visible&&!data&&!pending.current)void load();}}>
  <summary><Mail size={19} aria-hidden="true"/> Email updates <span>Preferences & delivery history</span></summary>
  {open&&<div className="email-settings-body">
   <p>Receive a short notice when a new update is saved. Emails contain a sign-in link; private documents, booking details and financial amounts stay in your account.</p>
   {error&&<p role="alert" className="error">{error}</p>}{message&&<p role="status" className="notice">{message}</p>}
   <button type="button" className="button secondary" disabled={busy} onClick={()=>void load(undefined,data?.page??1)}><RefreshCw size={16} aria-hidden="true"/>{busy?'Loading…':'Refresh email settings'}</button>
   {data&&<>
    <p className="preserve-lines"><strong>Account email:</strong> {data.email}</p>
    {data.emailChanged&&<p className="notice">Your account email changed. Save your preferences again to choose updates for this address. Earlier queued emails will not be sent.</p>}
    {!data.verified&&<p className="notice">Verify your account email before enabling email updates. <Link href="/workspace/account">Open account verification</Link></p>}
    {!data.sendingEnabled&&<p className="notice">Email sending is currently paused. Your in-app updates remain available.</p>}
    <form onSubmit={e=>{e.preventDefault();void load({action:'PREFERENCE',version:data.version,enabled,acknowledgement:ack});}}>
     <fieldset disabled={busy}><legend>Email preferences</legend>
      <label className="email-choice"><input type="checkbox" checked={enabled} disabled={!data.verified&&!data.enabled} onChange={e=>{setEnabled(e.target.checked);setAck(false);}}/> Send new updates to my account email</label>
      <p>Only future updates are queued. Saving preferences cancels earlier queued messages. Disabling email cannot recall a message already submitted to Gmail. The latest 20 records appear on each page.</p>
      <label className="email-choice"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/> I confirm this email preference change.</label>
      <button className="button" disabled={!ack||(!data.verified&&enabled)}>{busy?'Saving…':'Save email preferences'}</button>
     </fieldset>
    </form>
    <div className="email-history-heading"><h2>Email history</h2><p>{data.total} {data.total===1?'record':'records'} · Page {data.page} of {data.pageCount}</p></div>
    <p>“Accepted by Gmail” means the mail server accepted the message; inbox delivery is not confirmed. Unconfirmed outcomes cannot be resent. A rejected message can be retried explicitly, up to three attempts.</p>
    {!data.items.length?<p>No email messages have been queued for your account.</p>:<ul className="email-history">{data.items.map(item=><li key={item.id}><div><strong>{statuses[item.status]??item.status}</strong><span>{date(item.createdAt)} · {item.source.toLowerCase()} update · Attempt {item.attempts}</span></div>
     {item.canRetry&&<button className="button secondary" disabled={busy} onClick={()=>{if(!retry.current||retry.current.id!==item.id)retry.current={id:item.id,key:crypto.randomUUID()};void load({action:'RETRY',messageId:item.id,requestKey:retry.current.key,acknowledgement:true});}}>Retry rejected email</button>}
    </li>)}</ul>}
    <nav className="email-pagination" aria-label="Email history pages"><button className="button secondary" disabled={busy||data.page===1} onClick={()=>void load(undefined,data.page-1)}>Previous</button><button className="button secondary" disabled={busy||data.page>=data.pageCount} onClick={()=>void load(undefined,data.page+1)}>Next</button></nav>
   </>}
  </div>}
 </details>;
}
