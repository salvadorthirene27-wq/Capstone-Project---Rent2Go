import Link from 'next/link';
import {notFound} from 'next/navigation';
import {Workspace} from '@/components/workspace';
import {pageActor} from '@/lib/page-actor';
import {getGovernanceUsers} from '@/modules/governance/users';
import {DomainError} from '@/modules/partners/workflow';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const actor=await pageActor(),d=await getGovernanceUsers(actor,await searchParams).catch(e=>{if(e instanceof DomainError&&e.status===403)notFound();throw e;}),query=(page:number)=>`/admin/users?${new URLSearchParams({search:d.search,page:String(page)})}`;
 return <Workspace actor={actor}><h1>User access and roles</h1><p>Review current account roles and workspace access. Existing agency relationships and financial history retain their own authority and snapshots.</p><form method="get" className="report-filters"><label className="field">Find a user by display name or account reference<input name="search" defaultValue={d.search} maxLength={80}/></label><button className="button" type="submit">Find accounts</button></form><p>Matching accounts: {d.total} · Page {d.page} of {d.pageCount}</p>{d.items.length===0?<p>No accounts match this search.</p>:d.items.map(u=><article key={u.id} className="assessment-record"><h2>{u.name}</h2><p>{u.role.toLowerCase().replaceAll('_',' ')} · {u.suspended?'Workspace access disabled':'Workspace access active'}</p><Link className="button secondary" href={`/admin/users/${encodeURIComponent(u.id)}`}>Review user access</Link></article>)}{d.pageCount>1&&<nav className="pagination" aria-label="User account pages">{d.page>1&&<Link className="button secondary" href={query(d.page-1)}>Previous accounts</Link>}<span>Page {d.page} of {d.pageCount}</span>{d.page<d.pageCount&&<Link className="button secondary" href={query(d.page+1)}>Next accounts</Link>}</nav>}</Workspace>;
}
