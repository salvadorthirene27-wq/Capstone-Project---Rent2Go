import Link from 'next/link';
import {notFound} from 'next/navigation';
import {ZodError} from 'zod';
import {Workspace} from '@/components/workspace';
import {PaymentReconciliationList} from '@/components/payment-reconciliation';
import {pageActor} from '@/lib/page-actor';
import {getPaymentReconciliation} from '@/modules/gateway/reconciliation';
import {DomainError} from '@/modules/partners/workflow';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const actor=await pageActor(),data=await getPaymentReconciliation(actor,await searchParams).catch(e=>{if(e instanceof DomainError&&[403,404].includes(e.status))notFound();if(e instanceof ZodError)return null;throw e;});
 return <Workspace actor={actor}><Link className="back-link" href="/admin">Back to platform workspace</Link><nav className="page-navigation" aria-label="Platform payment sections"><Link href="/admin/payments" aria-current="page">Payment reconciliation</Link><Link href="/admin/disbursements">Agency disbursements</Link><Link href="/admin/payments/refunds">Provider refunds</Link></nav><h1>Payment reconciliation</h1><p>Review unresolved checkout and authenticated notification records. Saved payment facts, booking acceptance and financial closing remain separate.</p>{data?<PaymentReconciliationList data={data}/>:<p className="notice">Check the payment filters. <Link href="/admin/payments">Clear filters</Link> to return to the review queue.</p>}</Workspace>;
}
