import Link from 'next/link';
import {notFound} from 'next/navigation';
import {Workspace} from '@/components/workspace';
import {pageActor} from '@/lib/page-actor';
import {centralFundingDirectory} from '@/modules/gateway/funding';
import {DomainError} from '@/modules/partners/workflow';
import {money} from '@/modules/partners/presentation';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{page?:string}>}){const actor=await pageActor(),q=await searchParams,data=await centralFundingDirectory(actor,Number(q.page??1)).catch(e=>{if(e instanceof DomainError&&[403,404].includes(e.status))notFound();throw e;});return <Workspace actor={actor}><nav className="page-navigation" aria-label="Platform payment sections"><Link href="/admin/payments">Payment reconciliation</Link><Link href="/admin/disbursements">Agency disbursements</Link><Link href="/admin/payments/refunds">Provider refunds</Link><Link href="/admin/payments/funding" aria-current="page">Agency funding</Link></nav><h1>Agency funding review</h1><p>Independently verify the exact agency funding transfer before it changes central cash availability.</p>{!data.items.length?<p>No pending funding evidence.</p>:data.items.map(f=><Link className="context-link" key={f.id} href={`/admin/disbursements/${f.requestId}`}><strong>{f.agencyName} · {money(f.amountCentavos)}{f.environment==='DEMO'?' · Test funds':''}</strong><span>Review funding</span></Link>)}<nav className="page-navigation" aria-label="Funding review pages">{data.page>1&&<Link href={`?page=${data.page-1}`}>Previous</Link>}<span>Page {data.page}</span>{data.hasNext&&<Link href={`?page=${data.page+1}`}>Next</Link>}</nav></Workspace>;}
