import Link from 'next/link';
import {notFound} from 'next/navigation';
import {Workspace} from '@/components/workspace';
import {pageActor} from '@/lib/page-actor';
import {getPrivacyCases} from '@/modules/governance/privacy';
import {privacyLabels} from '@/modules/governance/presentation';
import {date} from '@/modules/partners/presentation';
import {DomainError} from '@/modules/partners/workflow';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const actor=await pageActor(),d=await getPrivacyCases(actor,await searchParams,true).catch(e=>{if(e instanceof DomainError&&e.status===403)notFound();throw e;}),query=(page:number)=>`/admin/privacy?${new URLSearchParams({view:d.view,page:String(page)})}`;
 return <Workspace actor={actor}><h1>Account and privacy review</h1><p>Review each exact request independently. Required records are retained, and ordinary deactivation cannot strand open obligations.</p><nav className="queue-tabs" aria-label="Privacy review queue filter"><Link className="button secondary" href="/admin/privacy">Open requests</Link><Link className="button secondary" href="/admin/privacy?view=ALL">All requests</Link></nav>{d.items.length===0?<p>No requests in this review queue.</p>:d.items.map(r=><article key={r.id} className="assessment-record"><h2>{privacyLabels[r.kind]} · {r.requesterName}</h2><p>{r.status.toLowerCase().replaceAll('_',' ')} · Updated {date(r.updatedAt)}</p><Link className="button" href={`/admin/privacy/${r.id}`}>Review exact privacy request</Link></article>)}{d.pageCount>1&&<nav className="pagination" aria-label="Platform privacy queue pages">{d.page>1&&<Link className="button secondary" href={query(d.page-1)}>Previous requests</Link>}<span>Page {d.page} of {d.pageCount}</span>{d.page<d.pageCount&&<Link className="button secondary" href={query(d.page+1)}>Next requests</Link>}</nav>}</Workspace>;
}
