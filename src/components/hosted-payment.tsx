"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {money} from '@/modules/partners/presentation';
type PaymentSource={requestVersion:number;isOwner:boolean;agreement:{id:string;digest:string;quoteId:string}|null;methods:string[];settlement?:{id:string;digest:string}|null;holdActive:boolean;status:string;totals:{balanceCentavos:number}};
type State={enabled:boolean;mode:'test'|'live'|null;custodyNotice:{revision:string;digest:string;body:string};checkout:null|{id:string;quoteId:string;agreementId:string;mode:'test'|'live';settlementId?:string|null;status:string;amountCentavos:number;checkoutUrl:string|null;payment:null|{collectionId:string|null}}};
const labels:Record<string,string>={PREPARED:'Preparing your secure checkout',PREPARING:'Preparing your secure checkout',AWAITING_PAYMENT:'Awaiting payment',PAID:'Payment confirmed by PayMongo',PAID_PENDING_POSTING:'Payment verified · updating your booking',PAID_RECONCILIATION:'Payment verified · financial review required',EXPIRED:'Checkout expired',CLOSING:'Closing the original checkout',REVIEW_REQUIRED:'Independent payment review required'};
export function HostedPayment({requestId,source,purpose='BOOKING'}:{requestId:string;source:PaymentSource;purpose?:'BOOKING'|'SETTLEMENT'}){
 const router=useRouter(),url=`/api/booking-requests/${encodeURIComponent(requestId)}/${purpose==='SETTLEMENT'?'settlement-checkout':'checkout'}`,[state,setState]=useState<State|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[consent,setConsent]=useState(false),[returned,setReturned]=useState('');
 const refresh=useRef(router.refresh);refresh.current=router.refresh;
 const current=useRef(true),pending=useRef(false),generation=useRef(0),abort=useRef<AbortController|null>(null),retry=useRef<{identity:string;body:Record<string,unknown>}|null>(null),lastStatus=useRef('');
 const load=useCallback(async()=>{
  if(pending.current||document.visibilityState==='hidden')return;pending.current=true;const token=++generation.current,controller=new AbortController();abort.current=controller;const timer=setTimeout(()=>controller.abort(),10000);
  try{const response=await fetch(url,{cache:'no-store',signal:controller.signal}),body=await response.json();if(!current.current||token!==generation.current)return;if(!response.ok){if([401,403,404].includes(response.status))setState(null);throw Error(body.error??'Unable to refresh online payment status.');}setState(body);setError('');const status=body.checkout?.status??'';if(status!==lastStatus.current&&['PAID','PAID_RECONCILIATION'].includes(status))refresh.current();lastStatus.current=status;}
  catch(e){if(current.current&&token===generation.current)setError(e instanceof Error&&e.name!=='AbortError'?e.message:'Connection interrupted. Refresh the original checkout status before continuing.');}
  finally{clearTimeout(timer);pending.current=false;}
 },[url]);
 useEffect(()=>{current.current=true;setState(null);setError('');setConsent(false);retry.current=null;lastStatus.current='';const result=new URLSearchParams(window.location.search).get('payment_return');setReturned(result==='success'?'You returned from PayMongo. Payment will be confirmed only after provider verification.':result==='cancel'?'You returned without completing checkout. Check the original payment status before continuing.':'');void load();const refresh=()=>{void load();},timer=setInterval(refresh,10000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);return()=>{current.current=false;generation.current++;abort.current?.abort();clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};},[load]);
 useEffect(()=>{setConsent(false);retry.current=null;},[source.agreement?.id,source.agreement?.digest,source.settlement?.id,source.settlement?.digest]);
 const checkout=state?.checkout,settlement=purpose==='SETTLEMENT',exactSource=settlement?source.settlement:source.agreement;
 const canPrepare=!!(state?.enabled&&source.isOwner&&exactSource&&source.totals.balanceCentavos>0&&(settlement?(!checkout||checkout.status==='EXPIRED'||(checkout.status==='PAID'&&checkout.settlementId!==source.settlement?.id)):(source.holdActive&&['AGREEMENT_SIGNED','PAYMENT_PARTIAL'].includes(source.status)&&(!checkout||(checkout.status==='EXPIRED'&&checkout.quoteId!==source.agreement?.quoteId)))));

 async function prepare(){
  if(!canPrepare||!consent||pending.current||!state||!exactSource)return;pending.current=true;setBusy(true);setError('');const token=++generation.current,controller=new AbortController();abort.current=controller;const timer=setTimeout(()=>controller.abort(),15000);
  const identity=JSON.stringify([source.requestVersion,exactSource,state.custodyNotice.revision,state.custodyNotice.digest]);if(retry.current?.identity!==identity)retry.current={identity,body:{version:source.requestVersion,idempotencyKey:crypto.randomUUID(),...(settlement?{settlementId:exactSource.id}:{agreementId:exactSource.id}),digest:exactSource.digest,custodyConsent:{revision:state.custodyNotice.revision,digest:state.custodyNotice.digest,accepted:true}}};
  try{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(retry.current.body),signal:controller.signal}),body=await response.json();if(!current.current||token!==generation.current)return;if(!response.ok){if([401,403,404].includes(response.status))setState(null);throw Error(body.error??'Unable to prepare the checkout. Refresh its original status before retrying.');}setState(body);}
  catch(e){if(current.current&&token===generation.current)setError(e instanceof Error&&e.name!=='AbortError'?e.message:'The checkout request has an uncertain result. Refresh its original status; do not start another payment.');}
  finally{clearTimeout(timer);pending.current=false;if(current.current)setBusy(false);}
 }
 return <div className="assessment-record" aria-busy={busy}>
  <h3>{settlement?'Pay your accepted additional balance':'Pay securely with PayMongo'}</h3><p>Card and supported wallets are handled on PayMongo’s secure checkout. Rent2Go does not receive your card details.</p>
  {state?.mode==='test'&&<p className="notice">PayMongo test payment · no real charge.</p>}{returned&&<p className="notice">{returned}</p>}{error&&<p role="alert" className="error-box">{error}</p>}
  {checkout&&<><p role="status"><strong>{labels[checkout.status]??'Payment status requires review'}</strong> · {money(checkout.amountCentavos)}</p>{checkout.checkoutUrl&&<a className="button" href={checkout.checkoutUrl}>Continue to PayMongo</a>}{checkout.payment?.collectionId&&<p><Link href={`/booking-payments/${checkout.payment.collectionId}`}>View verified payment record</Link></p>}</>}
  {canPrepare&&<><details className="assessment-record"><summary>How your payment and deposit are handled</summary><p>{state!.custodyNotice.body}</p></details><label className="fulfillment-checkbox"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} disabled={busy}/>I have reviewed and accept this payment and deposit handling notice.</label><button type="button" className="button" disabled={!consent||busy} onClick={()=>void prepare()}>{busy?'Preparing checkout…':'Prepare secure checkout'}</button></>}
  {state&&!state.enabled&&!checkout&&<p>Online checkout is currently unavailable. Your accepted quotation and payment history remain preserved.</p>}
  <button type="button" className="button secondary" disabled={busy} onClick={()=>void load()}>Refresh online payment status</button>
 </div>;
}
