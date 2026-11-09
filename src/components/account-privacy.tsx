import Link from 'next/link';
import type {privacyIdentity} from '@/modules/governance/identity';
import {getPrivacyCases,getOwnAccessHistory} from '@/modules/governance/privacy';
import {PrivacyRequest} from './privacy-request';
import {privacyLabels} from '@/modules/governance/presentation';
import {date} from '@/modules/partners/presentation';
export async function AccountPrivacy({user,query,limited=false}:{user:Awaited<ReturnType<typeof privacyIdentity>>;query:unknown;limited?:boolean}){
 const data=await getPrivacyCases(user,query),history=await getOwnAccessHistory(user),href=(view:string,page=1)=>`${limited?'/account-status':'/workspace/account'}?${new URLSearchParams({...(!limited?{section:'privacy'}:{}),view,page:String(page)})}`;
 return <div className="account-status-content"><p className="eyebrow">Your account & privacy</p><h1>{limited?'Workspace access is unavailable':'Privacy & access requests'}</h1><p>{user.name} · {user.role.toLowerCase().replaceAll('_',' ')}</p>
  {limited&&<p className="notice">You can review your own request history and ask for reactivation here. Ordinary workspace access is disabled; existing bookings, financial records and necessary evidence are retained.</p>}
  <PrivacyRequest suspended={limited}/>
  {history.length>0&&<section><h2>Your recent account-access decisions</h2><p>Latest 20 recorded decisions. Each privacy request retains its separate review history.</p>{history.map((h,i)=><article className="assessment-record" key={`${h.createdAt}:${i}`}><h3>{h.action.toLowerCase().replaceAll('_',' ')}</h3><p>{date(h.createdAt)}</p><p className="preserve-lines">{h.reason}</p>{h.statement&&<p>{h.statement}</p>}</article>)}</section>}
  <h2>Your saved requests</h2><nav className="queue-tabs" aria-label="Privacy request filter"><Link className="button secondary" href={href('OPEN')}>Open requests</Link><Link className="button secondary" href={href('ALL')}>All requests</Link></nav>
  {data.items.length===0?<p>No saved requests in this view.</p>:data.items.map(r=><article key={r.id} className="assessment-record"><h3>{privacyLabels[r.kind]}</h3><p>{r.status.toLowerCase().replaceAll('_',' ')} · Updated {date(r.updatedAt)}</p><Link className="button secondary" href={`/account-status/privacy/${r.id}`}>View saved privacy request</Link></article>)}
  {data.pageCount>1&&<nav className="pagination" aria-label="Privacy request pages">{data.page>1&&<Link className="button secondary" href={href(data.view,data.page-1)}>Previous</Link>}<span>Page {data.page} of {data.pageCount}</span>{data.page<data.pageCount&&<Link className="button secondary" href={href(data.view,data.page+1)}>Next</Link>}</nav>}
 </div>;
}
