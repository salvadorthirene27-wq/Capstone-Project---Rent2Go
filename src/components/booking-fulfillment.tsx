"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";
import {date} from "@/modules/partners/presentation";
import type {getFulfillment} from "@/modules/bookings/fulfillment";
import {InspectionDocument} from "./inspection-document";
type State=Awaited<ReturnType<typeof getFulfillment>>;
type Line=State["lines"][number];
type Report=NonNullable<Line["pre"]>;
type Mutate=(body:Record<string,unknown>)=>Promise<void>;
const stages:Record<string,string>={NOT_STARTED:"Not started",RENTAL_ACTIVE:"Rental active",RETURN_REVIEW:"Return awaiting review",RETURN_DISPUTED:"Return condition disputed",RETURNED:"Vehicle returned",TOUR_ACTIVE:"Tour active",TOUR_COMPLETED:"Tour completed"};

function InspectionRecord({report:r,canReply,blocked,lineId,mutate}:{report:Report;canReply:boolean;blocked:boolean;lineId:string;mutate:Mutate}){
 const [reviewed,setReviewed]=useState(false),[reason,setReason]=useState("");const phase=r.phase==="PRE"?"pre-inspection":"return inspection";
 return <section className="fulfillment-report">
  <InspectionDocument report={r}/>
  <a href={`/booking-inspections/${encodeURIComponent(r.id)}`} target="_blank" rel="noreferrer">View or print this saved inspection</a>
  {canReply&&<fieldset disabled={blocked}>
   <legend>Respond to this exact {phase}</legend>
   <label className="fulfillment-checkbox"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I reviewed this exact {phase}, version {r.revision}, including its condition and photos.</label>
   <button type="button" className="button" disabled={blocked||!reviewed} onClick={()=>mutate({action:"ACK_INSPECTION",lineId,inspectionId:r.id,digest:r.digest,decision:"ACCEPT",reason:""})}>Accept {phase}</button>
   <label className="field">{r.phase==="PRE"?"Pre-inspection dispute reason":"Return inspection dispute reason"}<textarea maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)}/></label>
   <button type="button" className="button secondary" disabled={blocked||!reason.trim()} onClick={()=>mutate({action:"ACK_INSPECTION",lineId,inspectionId:r.id,digest:r.digest,decision:"DISPUTE",reason})}>Dispute {phase}</button>
   <p>Accepting condition does not authorize deposit deductions, additional charges or financial settlement.</p>
  </fieldset>}
 </section>;
}
function ConditionForm({line,phase,blocked,mutate,upload}:{line:Line;phase:"PRE"|"POST";blocked:boolean;mutate:Mutate;upload:(lineId:string,phase:string,file:File)=>Promise<void>}){
 const [mileage,setMileage]=useState(""),[fuel,setFuel]=useState(""),[cleanliness,setCleanliness]=useState("CLEAN"),[notes,setNotes]=useState(""),[safe,setSafe]=useState(false),[checked,setChecked]=useState(false),[photoIds,setPhotoIds]=useState<string[]>([]),[file,setFile]=useState<File|null>(null),[error,setError]=useState("");
 const phaseLabel=phase==="PRE"?"Pre-inspection":"Return inspection",photos=line.availablePhotos.filter(p=>p.phase===phase);
 async function save(event:FormEvent){event.preventDefault();setError("");if(!/^\d+$/.test(mileage)||!/^\d$/.test(fuel)||Number(fuel)>8||!photoIds.length||photoIds.length>8){setError("Enter whole-number mileage, fuel from 0 to 8, and select 1–8 uploaded photos.");return;}
  await mutate({action:"RECORD_INSPECTION",lineId:line.id,phase,condition:{odometerKm:Number(mileage),fuelEighths:Number(fuel),cleanliness,damageNotes:notes,roadworthy:safe,safetyChecked:checked,photoIds}});
 }
 return <form onSubmit={save} className="fulfillment-condition-form">
  <fieldset disabled={blocked}><legend>{phaseLabel} condition record</legend>
   <p>{phase==="POST"?"Saving the first return inspection records actual return and closes physical occupancy. Renter condition review and financial reconciliation follow separately.":"Record the actual condition. The renter must accept the exact saved report before handover."}</p>
   {error&&<p className="error-message" role="alert">{error}</p>}
   <div className="form-grid"><label className="field">{phaseLabel} mileage (km)<input inputMode="numeric" pattern="[0-9]+" required value={mileage} maxLength={8} onChange={e=>setMileage(e.target.value)}/></label>
   <label className="field">{phaseLabel} fuel (eighths)<select required value={fuel} onChange={e=>setFuel(e.target.value)}><option value="">Choose fuel level</option>{Array.from({length:9},(_,n)=><option key={n} value={n}>{n}/8{n===0?" · Empty":n===8?" · Full":""}</option>)}</select></label></div>
   <label className="field">{phaseLabel} cleanliness<select value={cleanliness} onChange={e=>setCleanliness(e.target.value)}><option value="CLEAN">Clean</option><option value="NEEDS_CLEANING">Needs cleaning</option></select></label>
   <label className="field">{phaseLabel} condition and damage notes<textarea value={notes} required maxLength={4000} onChange={e=>setNotes(e.target.value)} placeholder="Describe existing or new marks and condition; state if no damage is observed."/></label>
   <label className="fulfillment-checkbox"><input type="checkbox" checked={safe} onChange={e=>setSafe(e.target.checked)}/>Vehicle is roadworthy</label>
   <label className="fulfillment-checkbox"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>Lights, brakes, tires, safety equipment and required vehicle documents checked</label>
   <label className="field">{phaseLabel} photo<input type="file" accept="image/png,image/jpeg" onChange={e=>{setFile(e.target.files?.[0]??null);setError("");}}/></label>
   <p>Private PNG or JPEG, up to 5 MB. Upload first, then select the photos to preserve in this report.</p>
   <button type="button" className="button secondary" disabled={blocked||!file} onClick={async()=>{if(file)await upload(line.id,phase,file);}}>Upload {phaseLabel.toLowerCase()} photo</button>
   {photos.length>0&&<div className="fulfillment-photo-choices" role="group" aria-label={`${phaseLabel} report photos`}>{photos.map((p,index)=><label className="fulfillment-checkbox" key={p.id}><input type="checkbox" checked={photoIds.includes(p.id)} onChange={e=>setPhotoIds(e.target.checked?[...photoIds,p.id]:photoIds.filter(id=>id!==p.id))}/>Photo {index+1}<a href={`/api/inspection-photos/${p.id}`} target="_blank" rel="noreferrer">View privately</a></label>)}</div>}
   <button type="submit" className="button" disabled={blocked||!photoIds.length||!notes.trim()||(phase==="PRE"&&(!safe||!checked))}>Save {phaseLabel.toLowerCase()}</button>
  </fieldset>
 </form>;
}
function ServiceControls({line,blocked,mutate,inWindow}:{line:Line;blocked:boolean;mutate:Mutate;inWindow:boolean}){
 const [handover,setHandover]=useState(false),[attendance,setAttendance]=useState(""),[note,setNote]=useState("");
 return <>
  {line.canRelease&&inWindow&&<fieldset disabled={blocked}><legend>Actual vehicle handover</legend><label className="fulfillment-checkbox"><input type="checkbox" checked={handover} onChange={e=>setHandover(e.target.checked)}/>I confirm the vehicle is being handed over now to the renter under the accepted inspection.</label><button type="button" className="button" disabled={blocked||!handover} onClick={()=>mutate({action:"RELEASE_RENTAL",lineId:line.id,inspectionId:line.pre!.id,digest:line.pre!.digest})}>Record vehicle handover</button></fieldset>}
  {line.canStartTour&&inWindow&&<fieldset disabled={blocked}><legend>Confirm guests and start tour</legend><label className="field">Guests present<input inputMode="numeric" value={attendance} onChange={e=>setAttendance(e.target.value)}/></label><label className="field">Attendance note<textarea maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}/></label><p>Record attendance within the booked party of {line.partySize}. No vehicle inspection applies to a tour-only service.</p><button type="button" className="button" disabled={blocked||!/^\d+$/.test(attendance)||Number(attendance)<1||Number(attendance)>line.partySize||!note.trim()} onClick={()=>mutate({action:"START_TOUR",lineId:line.id,attendance:Number(attendance),note})}>Record tour start</button></fieldset>}
  {line.canCompleteTour&&<fieldset disabled={blocked}><legend>Complete this tour</legend><label className="field">Tour completion note<textarea maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}/></label><button type="button" className="button" disabled={blocked||!note.trim()} onClick={()=>mutate({action:"COMPLETE_TOUR",lineId:line.id,note})}>Record tour completion</button></fieldset>}
 </>;
}
export function BookingFulfillment({requestId}:{requestId:string}){
 const router=useRouter(),endpoint=`/api/booking-requests/${encodeURIComponent(requestId)}/fulfillment`,[data,setData]=useState<State|null>(null),[busy,setBusy]=useState(true),[stale,setStale]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState(""),[tick,setTick]=useState(0),inFlight=useRef(false),clock=useRef({epoch:NaN,at:0}),retry=useRef<{fingerprint:string;key:string}|null>(null);
 function receive(s:State){clock.current={epoch:Date.parse(s.serverNow),at:performance.now()};setData(s);setStale(false);}
 useEffect(()=>{const c=new AbortController();setBusy(true);setData(null);fetch(endpoint,{cache:"no-store",signal:c.signal}).then(async r=>{const s=await r.json();if(!r.ok)throw Error(s.error||"Unable to load fulfillment.");if(!c.signal.aborted)receive(s);}).catch(e=>{if(!c.signal.aborted)setError(e.message);}).finally(()=>{if(!c.signal.aborted)setBusy(false);});return()=>c.abort();},[endpoint]);
 useEffect(()=>{const timer=setInterval(()=>setTick(v=>v+1),15000);return()=>clearInterval(timer);},[]);
 async function refresh(){const r=await fetch(endpoint,{cache:"no-store"}),s=await r.json();if(!r.ok)throw Error(s.error||"Unable to refresh fulfillment.");receive(s);}
 async function reload(){if(inFlight.current)return;inFlight.current=true;setBusy(true);setError("");setMessage("");try{await refresh();retry.current=null;router.refresh();}catch(e){setError(e instanceof Error?e.message:"Unable to reload fulfillment.");}finally{inFlight.current=false;setBusy(false);}}
 async function send(body:Record<string,unknown>|FormData){
  if(!data||busy||stale||inFlight.current)return;inFlight.current=true;setBusy(true);setError("");setMessage("");let saved=false;
  try{
   let url=endpoint,options:RequestInit;
   if(body instanceof FormData){url+="/photos";body.set("version",String(data.requestVersion));options={method:"POST",body};}
   else{const command={...body,version:data.requestVersion},fingerprint=JSON.stringify(command);if(retry.current?.fingerprint!==fingerprint)retry.current={fingerprint,key:crypto.randomUUID()};options={method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...command,idempotencyKey:retry.current.key})};}
   const r=await fetch(url,options),s=await r.json();if(r.status===409)setStale(true);if(!r.ok)throw Error(`${s.error||"Unable to save fulfillment."}${r.status===409?" Reload fulfillment before continuing.":""}`);saved=true;receive(s);retry.current=null;await refresh();setMessage("Fulfillment record saved. Financial reconciliation remains separate.");router.refresh();
  }catch(e){if(saved)setStale(true);setError(`${saved?"The record was saved, but refreshing failed. Reload fulfillment. ":""}${e instanceof Error?e.message:"Unable to save fulfillment."}`);}finally{inFlight.current=false;setBusy(false);}
 }
 async function upload(lineId:string,phase:string,file:File){if(file.size>5*1024*1024||!["image/png","image/jpeg"].includes(file.type)){setError("Choose a PNG or JPEG photo up to 5 MB.");return;}const body=new FormData();body.set("lineId",lineId);body.set("phase",phase);body.set("file",file);await send(body);}
 const now=clock.current.epoch+performance.now()-clock.current.at,blocked=busy||stale;void tick;
 return <section className="context-section booking-fulfillment" aria-labelledby="fulfillment-heading" aria-busy={busy}>
  <h2 id="fulfillment-heading">Service delivery and return</h2><p>Each rental and tour progresses separately. Deposits, extra charges and earnings require separate reconciliation.</p>
  {data?.environment==="DEMO"&&<p className="notice"><strong>Simulated booking · no charge</strong></p>}
  {error&&<p className="error-message" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  <button type="button" className="button secondary" disabled={busy} onClick={reload}>Reload fulfillment</button>
  {!data&&!error&&<p role="status">Loading service records…</p>}
  {data&&!data.funded&&<p>Complete requirements, accepted quotation, signature and full payment before service delivery.</p>}
  {data?.status==="FULFILLMENT_RECONCILIATION_PENDING"&&<p className="notice">Physical services have finished. Review any return disputes and reconcile deposits, charges and financial records before completing the booking.</p>}
  {data?.lines.map(line=><section className="fulfillment-line" key={line.id}>
   <header><h3>{line.title}</h3><strong>{stages[line.stage]??line.stage}</strong></header><p>{date(line.startAt)} – {date(line.endAt)} (Philippine time) · {line.partySize} guests{line.driverName&&<> · Driver: {line.driverName}</>}</p>
   {line.overdue&&<p className="notice">Overdue return. The vehicle and assigned driver remain unavailable until actual return is recorded.</p>}
   {line.safetyHold&&<p className="notice">Vehicle safety hold. Resolve the documented condition and record a corrected return inspection with photos for renter acceptance before this vehicle is offered again.</p>}
   {line.pre&&<InspectionRecord key={line.pre.id} report={line.pre} lineId={line.id} canReply={line.canAcknowledgePre} blocked={blocked} mutate={send}/>}
   {line.post&&<InspectionRecord key={line.post.id} report={line.post} lineId={line.id} canReply={line.canAcknowledgePost} blocked={blocked} mutate={send}/>}
   {line.canInspectPre&&<ConditionForm key={`${line.id}:pre:${line.pre?.id??"new"}`} line={line} phase="PRE" blocked={blocked} mutate={send} upload={upload}/>}
   {line.canInspectPost&&<ConditionForm key={`${line.id}:post:${line.post?.id??"new"}`} line={line} phase="POST" blocked={blocked} mutate={send} upload={upload}/>}
   <ServiceControls line={line} blocked={blocked} mutate={send} inWindow={Number.isFinite(now)&&now>=Date.parse(line.startAt)&&now<Date.parse(line.endAt)}/>
   {line.inspectionHistory?.length>0&&<details><summary>Saved inspection versions</summary><p>Showing the latest 20 reports. Each link preserves its original condition record and renter response.</p><ol>{line.inspectionHistory.map(r=><li key={r.id}><a href={`/booking-inspections/${encodeURIComponent(r.id)}`} target="_blank" rel="noreferrer">{r.phase==="PRE"?"Pre-inspection":"Return inspection"} · version {r.revision}</a> · {date(r.createdAt)} · {r.decision==="ACCEPT"?"Accepted":r.decision==="DISPUTE"?"Disputed":"Awaiting renter response"}</li>)}</ol></details>}
   {line.history.length>0&&<details><summary>Service history</summary><ol>{line.history.map((h,i)=><li key={i}>{h.action.replaceAll("_"," ").toLowerCase()} · {date(h.at)}{h.details.attendance!=null&&<> · {h.details.attendance} guests</>}{h.details.note&&<p>{h.details.note}</p>}</li>)}</ol></details>}
  </section>)}
 </section>;
}
