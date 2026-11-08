"use client";
import {useRef,useState} from 'react';
import type {BookingContactLog} from '@/modules/bookings/contacts';
import {contactCommand,contactMethodLabels,contactOutcomeLabels} from '@/modules/bookings/contact-schema';
import {manilaInputToIso} from '@/lib/manila-time';
import {date} from '@/modules/partners/presentation';
const local=(iso:string|null)=>iso?new Date(Date.parse(iso)+8*3600000).toISOString().slice(0,16):'';
export function BookingContacts({initial}:{initial:BookingContactLog}){
 const [data,setData]=useState<BookingContactLog|null>(initial),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[stale,setStale]=useState(false),[uncertain,setUncertain]=useState(false),[open,setOpen]=useState(false);
 const [kind,setKind]=useState<'ASSIGNMENT'|'CONTACT'>('ASSIGNMENT'),[assignee,setAssignee]=useState(initial.assignee?.id??''),[followUp,setFollowUp]=useState(local(initial.nextFollowUpAt)),[note,setNote]=useState(''),[method,setMethod]=useState<'PHONE'|'EMAIL'>('PHONE'),[outcome,setOutcome]=useState<keyof typeof contactOutcomeLabels>('REACHED'),[contactedAt,setContactedAt]=useState(local(initial.serverNow)),[issues,setIssues]=useState<Record<string,string>>({});
 const pending=useRef<Record<string,unknown>|null>(null),summary=useRef<HTMLElement>(null);
 const endpoint=`/api/booking-requests/${encodeURIComponent(initial.requestId)}/contacts`;
 function receive(result:BookingContactLog){setData(result);setAssignee(result.assignee?.id??'');setFollowUp(local(result.nextFollowUpAt));setContactedAt(local(result.serverNow));setNote('');setIssues({});setStale(false);setUncertain(false);pending.current=null;}
 async function reload(page=1,historyOnly=false){
  if(busy)return;setBusy(true);setError('');setMessage('');
  try{const res=await fetch(`${endpoint}?page=${page}`,{cache:'no-store'}),result=await res.json();if(!res.ok){if([401,403,404].includes(res.status))setData(null);throw Error(result.error||'Unable to load the contact log.');}if(historyOnly){if(result.version!==data?.version)setStale(true);setData(result);}else receive(result);}
  catch(e){setError(e instanceof Error?e.message:'Unable to load the contact log.');}finally{setBusy(false);}
 }
 async function save(){
  if(!data||busy||stale)return;
  let body=pending.current;
  if(!uncertain){
   const errors:Record<string,string>={};let next:string|null=null,contact:string|undefined;
   try{next=followUp?(followUp===local(data.nextFollowUpAt)?data.nextFollowUpAt:manilaInputToIso(followUp)):null;}catch{errors.nextFollowUpAt='Enter a valid follow-up time in Manila.';}
   if(kind==='CONTACT')try{contact=manilaInputToIso(contactedAt);}catch{errors.contactedAt='Enter the time the contact attempt happened.';}
   if(next&&next!==data.nextFollowUpAt&&Date.parse(next)<=Date.now())errors.nextFollowUpAt='Choose a future follow-up time in Manila.';
   if(contact&&Date.parse(contact)>Date.now()+120000)errors.contactedAt='A contact attempt cannot be recorded in the future.';
   const input={action:kind,assigneeId:assignee||null,nextFollowUpAt:next,note,version:data.version,idempotencyKey:crypto.randomUUID(),...(kind==='CONTACT'?{method,outcome,contactedAt:contact}:{})};
   const valid=contactCommand.safeParse(input);
   if(!valid.success)for(const issue of valid.error.issues)errors[String(issue.path[0])]=issue.path[0]==='note'?'Write a note of 3 to 2,000 characters.':'Check this field.';
   if(Object.keys(errors).length){setIssues(errors);setError('Check the marked fields.');return;}
   body=valid.data!;pending.current=body;
  }
  if(!body)return;
  setBusy(true);setError('');setMessage('');setIssues({});
  try{
   const res=await fetch(endpoint,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),result=await res.json();
   if(!res.ok){
    if([401,403,404].includes(res.status))setData(null);
    if(res.status===409){setStale(true);setUncertain(false);}
    else if(res.status>=500)setUncertain(true);
    else{pending.current=null;setUncertain(false);const fields:Record<string,string>={};for(const issue of result.issues??[])fields[String(issue.path?.[0])]='Check this field.';setIssues(fields);}
    throw Error(result.error||'Unable to save this contact record.');
   }
   receive(result);setMessage(result.duplicate?'This record was already saved. The latest log is shown.':'Contact record saved. No call or email was sent.');setOpen(false);summary.current?.focus();
  }catch(e){if(!(e instanceof Error)||e.name==='TypeError'||e.name==='SyntaxError')setUncertain(true);setError(e instanceof Error?e.message:'Unable to confirm whether the contact record saved.');}
  finally{setBusy(false);}
 }
 const fieldError=(key:string)=>issues[key]?<small id={`contact-${key}-error`} className="field-error">{issues[key]}</small>:null;
 return <section id="contact-followup" className="context-section contact-log" aria-labelledby="contact-heading" aria-busy={busy}>
  <div className="contact-log-heading"><div><h2 id="contact-heading">Agency contact & follow-up</h2><p>Internal agency records. Phone or email discussions do not accept a quotation or confirm a booking.</p></div><button type="button" className="link-button" disabled={busy} onClick={()=>reload(data?.page??1)}>Reload contact log</button></div>
  {error&&<p role="alert" className="field-error">{error}</p>}{message&&<p role="status">{message}</p>}
  {uncertain&&<p className="notice">The save result is uncertain. Retry the same save, or reload and check the saved history before making changes.</p>}
  {stale&&<p className="notice">Reload the contact log before making further changes. Your form has been kept for reference.</p>}
  {data&&<>
   <dl className="contact-summary"><div><dt>Assigned staff</dt><dd>{data.assignee?.name??'Unassigned'}{data.assignee&&!data.assignee.available&&' · no longer available'}</dd></div><div><dt>{data.editable?'Next follow-up':'Saved follow-up plan'}</dt><dd>{data.nextFollowUpAt?date(data.nextFollowUpAt):'Not scheduled'}{data.editable&&data.nextFollowUpAt&&Date.parse(data.nextFollowUpAt)<=Date.parse(data.serverNow)&&' · overdue'}</dd></div></dl>
   {!data.editable?<p className="notice">{data.blockedReason} Saved history remains available.</p>:<details open={open} onToggle={e=>setOpen(e.currentTarget.open)} className="policy-disclosure">
    <summary ref={summary}>Update assignment or record contact</summary>
    <form onSubmit={e=>{e.preventDefault();void save();}}>
     <fieldset disabled={busy||stale||uncertain}>
      <legend>Contact record</legend>
      <div className="contact-fields">
       <label>Record type<select value={kind} onChange={e=>{setKind(e.target.value as typeof kind);setIssues({});}}><option value="ASSIGNMENT">Assignment / follow-up plan</option><option value="CONTACT">Contact attempt already made</option></select></label>
       <label>Assigned staff<select value={assignee} onChange={e=>setAssignee(e.target.value)}><option value="">Unassigned</option>{data.assignee&&!data.assignee.available&&<option disabled value={data.assignee.id}>{data.assignee.name} — unavailable</option>}{data.staff.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
       {kind==='CONTACT'&&<>
        <label>Contact method<select value={method} onChange={e=>setMethod(e.target.value as typeof method)}>{Object.entries(contactMethodLabels).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
        <label>Contact outcome<select value={outcome} onChange={e=>setOutcome(e.target.value as typeof outcome)}>{Object.entries(contactOutcomeLabels).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
        <label>Contact time · Manila<input type="datetime-local" required value={contactedAt} onInput={e=>setContactedAt(e.currentTarget.value)} onChange={e=>setContactedAt(e.target.value)} aria-invalid={!!issues.contactedAt} aria-describedby={issues.contactedAt?'contact-contactedAt-error':undefined}/>{fieldError('contactedAt')}</label>
       </>}
       <label>Next follow-up · Manila (optional)<input type="datetime-local" value={followUp} onInput={e=>setFollowUp(e.currentTarget.value)} onChange={e=>setFollowUp(e.target.value)} aria-invalid={!!issues.nextFollowUpAt} aria-describedby={issues.nextFollowUpAt?'contact-nextFollowUpAt-error':undefined}/>{fieldError('nextFollowUpAt')}</label>
      </div>
      <label>Internal note<textarea required minLength={3} maxLength={2000} rows={3} value={note} onChange={e=>setNote(e.target.value)} aria-invalid={!!issues.note} aria-describedby={`contact-note-help${issues.note?' contact-note-error':''}`}/>{fieldError('note')}</label>
      <p id="contact-note-help">Keep notes relevant to this request. Do not include passwords, verification codes or identity-document numbers. Recording a contact attempt sends nothing and does not change reservation or payment status.</p>
     </fieldset>
     <button type="submit" className="button" disabled={busy||stale}>{busy?'Saving…':uncertain?'Retry same save':kind==='ASSIGNMENT'?'Save follow-up plan':'Record contact attempt'}</button>
    </form>
   </details>}
   <details className="policy-disclosure" key={`history-${data.page}`}>
    <summary>Contact history · {data.total} {data.total===1?'record':'records'}</summary>
    {!data.history.length?<p>No contact records have been saved.</p>:<ol className="notification-list">{data.history.map(h=><li key={h.id} className="assessment-record"><h3>{h.kind==='ASSIGNMENT'?'Assignment / follow-up plan':`${contactMethodLabels[h.method!]} · ${contactOutcomeLabels[h.outcome!]}`}</h3><p>Recorded by {h.actorName} · {date(h.recordedAt)}</p>{h.contactedAt&&<p>Contact time: {date(h.contactedAt)}</p>}<p>Assigned to {h.assignedName??'no staff member'} · Next follow-up: {h.nextFollowUpAt?date(h.nextFollowUpAt):'not scheduled'}</p><p className="preserve-lines">{h.note}</p></li>)}</ol>}
    {data.pageCount>1&&<nav className="pagination" aria-label="Contact history pages">{data.page>1&&<button type="button" className="link-button" disabled={busy} onClick={()=>reload(data.page-1,true)}>Previous records</button>}<span>Page {data.page} of {data.pageCount}</span>{data.page<data.pageCount&&<button type="button" className="link-button" disabled={busy} onClick={()=>reload(data.page+1,true)}>Next records</button>}</nav>}
   </details>
  </>}
 </section>;
}
