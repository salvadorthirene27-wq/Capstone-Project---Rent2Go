"use client";
import Link from 'next/link';
import {EmailUpdates} from './email-settings';
import {useEffect,useRef,useState} from 'react';
import {MailCheck,ShieldCheck} from 'lucide-react';
import type {AccountIdentity} from '@/modules/account/service';
import {onboardingPaths,type OnboardingPath} from '@/modules/account/onboarding';
export function AccountSecurity({initial,onboarding}:{initial:AccountIdentity;onboarding?:OnboardingPath}){
 const [data,setData]=useState<AccountIdentity|null>(initial),[busy,setBusy]=useState(false),[code,setCode]=useState(''),[wait,setWait]=useState(0),[error,setError]=useState(''),[message,setMessage]=useState('');
 const pending=useRef(false),active=useRef(true),request=useRef<AbortController|null>(null),feedback=useRef<HTMLParagraphElement>(null);
 useEffect(()=>{active.current=true;return()=>{active.current=false;request.current?.abort();};},[]);
 useEffect(()=>{if(error||message)feedback.current?.focus();},[error,message]);
 useEffect(()=>{if(!wait)return;const timer=setTimeout(()=>setWait(n=>Math.max(0,n-1)),1000);return()=>clearTimeout(timer);},[wait]);
 async function load(action?:'SEND_VERIFICATION'|'VERIFY_EMAIL'){
  if(pending.current||!data)return;pending.current=true;setBusy(true);setError('');setMessage('');
  if(action==='SEND_VERIFICATION')setWait(60);
  const abort=new AbortController();request.current=abort;
  try{
   const response=await fetch('/api/account',{method:action?'POST':'GET',...(action?{headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...(action==='VERIFY_EMAIL'?{code}:{})})}:{}),cache:'no-store',signal:abort.signal}),body=await response.json();
   if(!active.current)return;if(!response.ok){if([401,403].includes(response.status))setData(null);throw Error(body.error??'Unable to refresh your account.');}
   const account=action?body.account:body;if(account.id!==initial.id){setData(null);throw Error('Account identity changed. Sign in again.');}setData(account);if(account.emailVerified)setCode('');setMessage(action?body.message:'Your account status is refreshed.');
  }catch(e){if(active.current&&!(e instanceof Error&&e.name==='AbortError'))setError(e instanceof Error?e.message:'Connection failed. Try again.');}
  finally{pending.current=false;if(active.current)setBusy(false);}
 }
 return <div className="account-security"><p className="eyebrow">Your Rent2Go account</p><h1>Account & security</h1>
  <p>Keep your email verified so you can receive account codes and choose email updates.</p>
  {(error||message)&&<p ref={feedback} tabIndex={-1} role={error?'alert':'status'} className={error?'error-box':'notice'}>{error||message}</p>}
  {!data?<p><Link href="/login">Sign in again</Link> to continue managing your account.</p>:<>
   {onboarding&&<section className="context-section"><h2>Get started</h2>
    <Link className="button secondary" href={onboardingPaths[onboarding].href}>{onboardingPaths[onboarding].action}</Link>
   </section>}
   <section className="context-section"><h2><MailCheck size={22} aria-hidden="true"/> Email verification</h2><p><strong>{data.email}</strong></p><p className="account-verification-state"><ShieldCheck size={18} aria-hidden="true"/>{data.emailVerified?'Email verified':'Email not yet verified'}</p>
    {data.emailVerified?<p>Your email ownership is confirmed. Identity documents and agency approval still have their own reviews.</p>:<>
     <p>Request a code for the email on this account, then enter it below. Paste and password-manager autofill are supported. A new code may replace an earlier code.</p>
     <button type="button" className="button secondary" disabled={busy||wait>0} onClick={()=>void load('SEND_VERIFICATION')}>{wait?`Request another code in ${wait}s`:'Send verification code'}</button>
     <form onSubmit={e=>{e.preventDefault();void load('VERIFY_EMAIL');}}><fieldset disabled={busy}><legend>Verify your account email</legend><label className="field">Verification code<input name="verification-code" value={code} onChange={e=>setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required aria-describedby="verification-code-hint"/></label><p id="verification-code-hint">Enter the six-digit code from your email. Expired or incorrect codes do not verify your account.</p><button className="button" disabled={!/^\d{6}$/.test(code)}>Verify email</button></fieldset></form>
    </>}
    <button type="button" className="button secondary" disabled={busy} onClick={()=>void load()}>{busy?'Please wait…':'Refresh account status'}</button>
   </section>
   <section className="context-section"><h2>Password recovery</h2><p>If you forget your password, request a reset code from the sign-in page. A completed reset signs out existing sessions so you can sign in with your new password.</p><Link className="button secondary" href="/login?mode=recover">Open password recovery</Link></section>
   <section id="notification-preferences" className="context-section"><h2>Notification preferences</h2><p>Verified accounts can choose email updates. The notification inbox stays available whether email is on or off.</p><EmailUpdates/></section>
  </>}
 </div>;
}
