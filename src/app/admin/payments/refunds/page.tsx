import Link from 'next/link';
import {notFound} from 'next/navigation';
import {Workspace} from '@/components/workspace';
import {ProviderRefundQueue} from '@/components/provider-refund-queue';
import {pageActor} from '@/lib/page-actor';
import {providerRefundDirectory} from '@/modules/gateway/provider-refunds';
import {DomainError} from '@/modules/partners/workflow';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const params=await searchParams,actor=await pageActor(),data=await providerRefundDirectory(actor,{page:params.page??1}).catch(e=>{if(e instanceof DomainError&&[403,404].includes(e.status))notFound();throw e;});return <Workspace actor={actor}><nav className="page-navigation" aria-label="Platform payment sections"><Link href="/admin/payments">Payment reconciliation</Link><Link href="/admin/disbursements">Agency disbursements</Link><Link href="/admin/payments/refunds" aria-current="page">Provider refunds</Link></nav><h1>Provider refund execution</h1><p>The renter requests a refund and the agency reviews its original policies. An independent platform reviewer authorizes PayMongo execution from the original centrally collected payment.</p><ProviderRefundQueue data={data}/><nav className="page-navigation" aria-label="Refund request pages">{data.page>1&&<Link href={`/admin/payments/refunds?page=${data.page-1}`}>Previous</Link>}<span>Page {data.page}</span>{data.hasNext&&<Link href={`/admin/payments/refunds?page=${data.page+1}`}>Next</Link>}</nav></Workspace>;}
