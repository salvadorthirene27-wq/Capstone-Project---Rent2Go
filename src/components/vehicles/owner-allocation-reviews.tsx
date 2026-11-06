"use client";
import {useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import type {OwnerAllocationState} from "@/modules/bookings/owner-allocation";
import {money,date} from "@/modules/partners/presentation";
import {extraChargeLabels} from "@/modules/partners/extra-charges";
type Review=OwnerAllocationState['items'][number];
type Decision={assessmentId:string;digest:string;version:number;decision:'ACCEPT'|'DISPUTE';consent:boolean;reason:string};
function Shares({value}:{value:{cosigner:number;agency:number;platform:number;maintenance:number}}){return <p>Cosigner {value.cosigner/100}% · agency {value.agency/100}% · Rent2Go {value.platform/100}% · maintenance {value.maintenance/100}%</p>;}
function ReviewCard({item,blocked,send}:{item:Review;blocked:boolean;send:(v:Decision)=>Promise<void>}){
 const [reason,setReason]=useState(''),[consent,setConsent]=useState(false),p=item.packet;
 const exact={assessmentId:item.assessmentId,digest:item.digest,version:item.requestVersion};
 return <article className="assessment-record"><h3>Assessment version {item.assessmentRevision} · {p.agencyName}</h3>
  {p.environment==='DEMO'&&<p className="notice">Based on simulated payments.</p>}
  <p>{item.decision==='ACCEPT'?'Allocation accepted':item.decision==='DISPUTE'?'Allocation disputed':item.isCurrent?'Awaiting your allocation review':'Superseded by a newer assessment'}</p>
  {p.lines.map(l=><div key={l.lineId}><h4>{l.title}</h4><p>{date(l.startAt)} – {date(l.endAt)}</p><details><summary>Original service revenue agreement</summary><p>Service revenue after assessment credits: {money(l.netServiceCentavos)}. Quoted driver fees are included. Refundable deposits are excluded.</p><Shares value={l.originalServiceShares}/></details></div>)}
  {p.charges.map(i=><section className="assessment-charge" key={i.id}><h4>{extraChargeLabels[i.policy.type]} · {money(i.amountCentavos)}</h4><p>{i.reason}</p><p>{i.policy.explanation}</p><p>Agency policy version {i.policy.revision}</p><Shares value={i.policy.shares}/></section>)}
  {item.reason&&<p className="preserve-lines">Your review reason: {item.reason}</p>}{item.reviewedAt&&<p>Recorded {date(item.reviewedAt)}</p>}
  {item.blockedReason&&<p className="notice">{item.blockedReason}</p>}
  {(item.canAccept||item.canDispute)&&<fieldset disabled={blocked}><legend>Review your vehicle's allocation</legend><label className="field">Owner review reason<textarea maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)}/></label>
   {item.canAccept&&<><label className="assessment-check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>I reviewed these exact charges and percentages for my vehicle. I accept this allocation separately from the renter's consent. This does not authorize a deposit deduction or create a payout.</label><button className="button" type="button" disabled={blocked||!consent} onClick={()=>send({...exact,decision:'ACCEPT',consent:true,reason})}>Accept vehicle allocation</button></>}
   {item.canDispute&&<button className="button secondary" type="button" disabled={blocked||!reason.trim()} onClick={()=>send({...exact,decision:'DISPUTE',consent:false,reason})}>Dispute vehicle allocation</button>}
  </fieldset>}
 </article>;
}
export function OwnerAllocationReviews({offerId}:{offerId:string}){
 const router=useRouter(),[data,setData]=useState<OwnerAllocationState|null>(null),[scope,setScope]=useState<'OPEN'|'HISTORY'>('OPEN'),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[stale,setStale]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const activeOffer=useRef(offerId);activeOffer.current=offerId;
 const mounted=useRef(true),generation=useRef(0),retry=useRef<{fingerprint:string;body:string}|null>(null),url=`/api/vehicles/${offerId}/allocation-reviews`;
 async function load(nextScope=scope,page=1){const token=++generation.current;setLoading(true);setError('');try{const r=await fetch(`${url}?scope=${nextScope}&page=${page}`,{cache:'no-store'}),body=await r.json();if(!r.ok)throw Error(body.error??'Unable to load owner reviews.');if(mounted.current&&token===generation.current){setData(body);setScope(nextScope);setStale(false);retry.current=null;}}catch(e){if(mounted.current&&token===generation.current)setError(e instanceof Error?e.message:'Unable to load owner reviews.');}finally{if(mounted.current&&token===generation.current)setLoading(false);}}
 useEffect(()=>{mounted.current=true;setData(null);setMessage('');setBusy(false);setStale(false);retry.current=null;void load('OPEN');return()=>{mounted.current=false;generation.current++;};},[offerId]);
 async function send(value:Decision){if(busy||loading||stale)return;const submittedOffer=offerId;setBusy(true);setError('');setMessage('');const command={action:'REVIEW_OWNER_ALLOCATION',...value},fingerprint=JSON.stringify(command);if(retry.current?.fingerprint!==fingerprint)retry.current={fingerprint,body:JSON.stringify({...command,idempotencyKey:crypto.randomUUID()})};
  try{const r=await fetch(url,{method:'PATCH',headers:{'Content-Type':'application/json'},body:retry.current.body}),body=await r.json();if(!r.ok){if(r.status===409&&mounted.current&&activeOffer.current===submittedOffer)setStale(true);throw Error(body.error??'Unable to save owner review.');}if(mounted.current&&activeOffer.current===submittedOffer){setData(old=>old?{...old,items:old.items.filter(i=>i.assessmentId!==value.assessmentId),total:Math.max(0,old.total-1)}:old);setMessage(value.decision==='ACCEPT'?'Vehicle allocation accepted. View its saved record in history.':'Vehicle allocation disputed. The agency must prepare corrected terms.');await load();router.refresh();}}
  catch(e){if(mounted.current&&activeOffer.current===submittedOffer)setError(e instanceof Error?e.message:'Unable to save owner review.');}finally{if(mounted.current&&activeOffer.current===submittedOffer)setBusy(false);}}
 const blocked=busy||loading||stale;
 return <section className="booking-assessments" aria-labelledby="owner-allocation-title" aria-busy={busy||loading}><h2 id="owner-allocation-title">Vehicle allocation reviews</h2><p>Review extra-charge allocations for this vehicle after the renter accepts an itemized assessment. You see only this vehicle's relevant terms. Acceptance does not collect money, deduct a deposit or establish withdrawable earnings.</p>
  <div className="assessment-actions"><button className="button secondary" type="button" aria-pressed={scope==='OPEN'} disabled={busy||loading} onClick={()=>load('OPEN')}>Awaiting your review</button><button className="button secondary" type="button" aria-pressed={scope==='HISTORY'} disabled={busy||loading} onClick={()=>load('HISTORY')}>Owner review history</button><button className="button quiet" type="button" disabled={busy||loading} onClick={()=>load(scope,data?.page??1)}>Refresh owner reviews</button></div>
  {message&&<p role="status">{message}</p>}{error&&<p role="alert" className="error-message">{error}</p>}{stale&&<p>Refresh owner reviews before making another decision.</p>}{loading&&!data&&<p role="status">Loading owner allocation reviews…</p>}
  {data&&!data.items.length&&<p>{scope==='OPEN'?'No vehicle allocations are awaiting your review.':'No previous owner allocation reviews.'}</p>}
  {data?.items.map(item=><ReviewCard key={`${item.assessmentId}:${item.requestVersion}`} item={item} blocked={blocked} send={send}/>)}
  {data&&data.pageCount>1&&<nav aria-label="Owner review pages"><button className="button secondary" type="button" disabled={blocked||data.page<=1} onClick={()=>load(scope,data.page-1)}>Previous owner reviews</button><span>Page {data.page} of {data.pageCount}</span><button className="button secondary" type="button" disabled={blocked||data.page>=data.pageCount} onClick={()=>load(scope,data.page+1)}>Next owner reviews</button></nav>}
 </section>;
}
