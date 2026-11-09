import Link from 'next/link';
import {notFound} from 'next/navigation';
import {Workspace} from '@/components/workspace';
import {pageActor} from '@/lib/page-actor';
import {disbursementDirectory} from '@/modules/gateway/disbursements';
import {DomainError} from '@/modules/partners/workflow';
import {date,money} from '@/modules/partners/presentation';
import {ZodError} from 'zod';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const actor=await pageActor(),data=await disbursementDirectory(actor,await searchParams).catch(e=>{if(e instanceof DomainError&&[403,404].includes(e.status))notFound();if(e instanceof ZodError)return null;throw e;});
 return <Workspace actor={actor}><nav className="page-navigation" aria-label="Platform payment sections"><Link href="/admin/payments">Payment reconciliation</Link><Link href="/admin/disbursements" aria-current="page">Agency disbursements</Link><Link href="/admin/payments/refunds">Provider refunds</Link></nav><h1>Agency disbursements</h1><p>Review the agency destination and exact closed allocations. Approval, transfer evidence and agency receipt confirmation are recorded separately.</p>{!data?<p className="notice">Check the filters. <Link href="/admin/disbursements">Clear filters</Link></p>:<><nav className="page-navigation" aria-label="Disbursement filters"><Link href="/admin/disbursements" aria-current={data.view==='CURRENT'?'page':undefined}>Current requests</Link><Link href="/admin/disbursements?view=ALL" aria-current={data.view==='ALL'?'page':undefined}>All history</Link></nav><p>{data.total} requests</p>{!data.items.length?<p>No independent disbursement reviews in this view.</p>:<div className="directory-list">{data.items.map(d=><Link key={d.id} className="context-link" href={`/admin/disbursements/${d.requestId}`}><span><strong>{d.agencyName} · {money(d.amountCentavos)}</strong><small>{d.stage.replaceAll('_',' ').toLowerCase()} · {date(d.createdAt)}{d.environment==='DEMO'?' · Test funds':''}</small></span><span>Review</span></Link>)}</div>}<nav className="page-navigation" aria-label="Disbursement review pages">{data.page>1&&<Link href={`?view=${data.view}&page=${data.page-1}`}>Previous</Link>}<span>{data.page} / {data.pageCount}</span>{data.page<data.pageCount&&<Link href={`?view=${data.view}&page=${data.page+1}`}>Next</Link>}</nav></>}</Workspace>;
}
