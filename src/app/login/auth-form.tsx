"use client";
import {useEffect,useRef,useState} from 'react';
import {Eye,EyeOff} from 'lucide-react';
import {authClient} from '@/lib/auth-client';
type Mode='login'|'signup'|'recover'|'reset-code'|'reset';
const headings:Record<Mode,string>={login:'Welcome back to Rent2Go!',signup:'Create your account',recover:'Recover your account','reset-code':'Verify your reset code',reset:'Set a new password'};
export function AuthForm(){
 const [mode,setMode]=useState<Mode>('login'),[email,setEmail]=useState(''),[recoveryEmail,setRecoveryEmail]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[visible,setVisible]=useState(false),[wait,setWait]=useState(0);
 const [codeGeneration,setCodeGeneration]=useState(0);
 const active=useRef(true),pending=useRef(false),feedback=useRef<HTMLParagraphElement>(null),verifiedCode=useRef('');
 const recovery=mode==='recover'||mode==='reset-code'||mode==='reset',codeRequested=mode==='reset-code'||mode==='reset';
 useEffect(()=>{active.current=true;const initial=new URLSearchParams(window.location.search).get('mode');if(initial==='signup'||initial==='recover')setMode(initial);return()=>{active.current=false;};},[]);
 useEffect(()=>{if(error||message)feedback.current?.focus();},[error,message]);
 useEffect(()=>{if(!wait)return;const timer=setTimeout(()=>setWait(n=>Math.max(0,n-1)),1000);return()=>clearTimeout(timer);},[wait]);
 function change(next:Mode){if(pending.current)return;verifiedCode.current='';setMode(next);setError('');setMessage('');setVisible(false);if(next!=='reset'&&next!=='reset-code')setRecoveryEmail('');}
 async function requestCode(target:string){
  verifiedCode.current='';setCodeGeneration(n=>n+1);if(mode==='reset')setMode('reset-code');
  const result=await authClient.emailOtp.requestPasswordReset({email:target});
  if(result.error)throw Error('Unable to request a reset code right now. Wait and try again.');
  if(!active.current)return;setRecoveryEmail(target);setMode('reset-code');setVisible(false);setMessage('If this account is eligible, a reset code will be emailed. Check your Inbox and Spam, then enter the code below.');
 }
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(pending.current)return;pending.current=true;setBusy(true);setError('');setMessage('');
  const form=event.currentTarget,values=new FormData(form),target=(codeRequested?recoveryEmail:email).trim(),password=String(values.get('password')??'');
  let resetSubmitted=false;
  try{
   if(mode==='recover'){if(wait)throw Error('Wait before requesting another reset code.');setWait(60);await requestCode(target);return;}
   if(mode==='reset-code'){
    const otp=String(values.get('otp')??'');if(!/^\d{6}$/.test(otp))throw Error('Enter the six-digit reset code from your email.');
    const result=await authClient.emailOtp.checkVerificationOtp({email:target,otp,type:'forget-password'});
    if(result.error||!result.data?.success)throw Error('Unable to verify this reset code. Check the code, or request a new one if it has expired.');
    if(!active.current)return;verifiedCode.current=otp;form.reset();setMode('reset');setVisible(false);setMessage('Reset code confirmed. Choose your new password.');return;
   }
   if(mode==='signup'||mode==='reset'){
    if(password.length<12||password.length>128)throw Error('Use a password with 12 to 128 characters.');
    if(password!==String(values.get('confirmPassword')??''))throw Error('The passwords do not match.');
   }
   if(mode==='signup'){
    const name=String(values.get('name')??'').trim();if(name.length<2)throw Error('Enter your full name.');
    const result=await authClient.signUp.email({email:target,password,name});
    if(result.error)throw Error('Unable to create the account. Check your details, or sign in or recover an existing account.');
    if(!active.current)return;form.reset();setVisible(false);
    if(result.data?.token)window.location.assign('/workspace/account');else{setMode('login');setMessage('Your account is created. Sign in to open Account & security and verify your email.');}
   }else if(mode==='reset'){
    const otp=verifiedCode.current;if(!/^\d{6}$/.test(otp)){setMode('reset-code');throw Error('Verify your reset code before choosing a new password.');}
    resetSubmitted=true;
    const result=await authClient.emailOtp.resetPassword({email:target,otp,password});
    if(result.error&&String(result.error.code)==='PASSWORD_REUSE'){resetSubmitted=false;form.reset();setVisible(false);throw Error('Choose a new password different from your current password.');}
    if(result.error)throw Error('Unable to update the password. Verify your code again, or request a new code if it has expired.');
    if(!active.current)return;verifiedCode.current='';form.reset();setMode('login');setVisible(false);setRecoveryEmail('');setMessage('Password updated. Sign in with your new password. Existing sessions have been signed out.');
   }else{
    const result=await authClient.signIn.email({email:target,password});if(result.error)throw Error('Unable to sign in. Check your email and password, or recover your account.');
    if(active.current)window.location.assign('/workspace');
   }
  }catch(e){if(active.current){if(resetSubmitted){verifiedCode.current='';form.reset();setMode('reset-code');setVisible(false);}setError(e instanceof Error?e.message:'Connection failed. Try again.');}}
  finally{pending.current=false;if(active.current)setBusy(false);}
 }
 async function resend(){
  if(pending.current||wait||!recoveryEmail)return;pending.current=true;setBusy(true);setError('');setMessage('');setWait(60);
  try{await requestCode(recoveryEmail);}catch(e){if(active.current)setError(e instanceof Error?e.message:'Unable to request a reset code.');}
  finally{pending.current=false;if(active.current)setBusy(false);}
 }
 return <section className="auth-form"><h2>{headings[mode]}</h2>
  <p>{mode==='signup'?'Create one account to rent, offer a vehicle or apply as an agency. Agency access follows approval.':mode==='recover'?'Request a code for the email you registered with.':mode==='reset-code'?'Enter the code sent to your account email. You can choose a new password after the code is verified.':mode==='reset'?'Your reset code is confirmed. Choose and confirm your new password.':'Enter your details to continue.'}</p>
  {recovery&&<ol className="auth-recovery-steps" aria-label="Password recovery steps">{['Request code','Verify code','New password'].map((step,index)=><li key={step} aria-current={(mode==='recover'?0:mode==='reset-code'?1:2)===index?'step':undefined}><span aria-hidden="true">{index+1}</span>{step}</li>)}</ol>}
  <form key={`${mode}:${codeGeneration}`} onSubmit={submit}><fieldset disabled={busy} className="auth-fields"><legend className="sr-only">{headings[mode]}</legend>
   {mode==='signup'&&<label>Full name<input name="name" autoComplete="name" required minLength={2} maxLength={120}/></label>}
   <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={200} value={codeRequested?recoveryEmail:email} readOnly={codeRequested} onChange={e=>setEmail(e.target.value)}/></label>
   {mode==='reset-code'&&<label>Reset code<input name="otp" required autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6}/></label>}
   {(mode==='login'||mode==='signup'||mode==='reset')&&<><div className="auth-password-field"><label htmlFor="auth-password">{mode==='reset'?'New password':'Password'}</label><div className="auth-password-control"><input id="auth-password" name="password" type={visible?'text':'password'} minLength={mode==='login'?1:12} maxLength={128} required autoComplete={mode==='login'?'current-password':'new-password'}/><button type="button" className="password-visibility" aria-label={visible?'Hide password':'Show password'} aria-pressed={visible} aria-controls="auth-password" onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={19} aria-hidden="true"/>:<Eye size={19} aria-hidden="true"/>}</button></div></div>
    {mode!=='login'&&<><small>Use 12 to 128 characters. Password managers and paste are supported.{mode==='reset'?' Your new password must be different from your current password.':''}</small><label>Confirm new password<input name="confirmPassword" type={visible?'text':'password'} autoComplete="new-password" minLength={12} maxLength={128} required/></label></>}
   </>}
   {(error||message)&&<p ref={feedback} tabIndex={-1} className={error?'error-box':'notice'} role={error?'alert':'status'}>{error||message}</p>}
   <button className="button wide" disabled={busy||(mode==='recover'&&wait>0)}>{busy?'Please wait…':mode==='signup'?'Create account':mode==='recover'?(wait?`Request another code in ${wait}s`:'Send reset code'):mode==='reset-code'?'Verify reset code':mode==='reset'?'Update password':'Sign in'}</button>
   {mode==='reset'&&<p className="auth-code-note">If you request another code, you will return to code verification.</p>}
   {codeRequested&&<button type="button" className="button secondary wide" disabled={busy||wait>0} onClick={()=>void resend()}>{wait?`Request another code in ${wait}s`:'Request another reset code'}</button>}
  </fieldset></form>
  <div className="auth-links">{codeRequested&&<button type="button" className="link-button" disabled={busy} onClick={()=>change('recover')}>Use a different email</button>}
   {mode==='reset'&&<button type="button" className="link-button" disabled={busy} onClick={()=>change('reset-code')}>Use a different reset code</button>}
   <button type="button" className="link-button" disabled={busy} onClick={()=>change(mode==='signup'?'login':'signup')}>{mode==='signup'?'Already registered? Sign in':'New here? Create an account'}</button>
   <button type="button" className="link-button" disabled={busy} onClick={()=>change(mode==='login'?'recover':'login')}>{mode==='login'?'Forgot password?':'Back to sign in'}</button>
  </div>
 </section>;
}
