import Link from 'next/link';
import {notFound} from 'next/navigation';
import {Workspace} from '@/components/workspace';
import {OwnerAccountDirectory} from '@/components/owner-account-directory';
import {pageActor} from '@/lib/page-actor';
import {getOwnerAccounts,accountsQuery} from '@/modules/accounting/owner-accounts';
import {DomainError} from '@/modules/partners/workflow';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{environment?:string|string[];page?:string|string[]}>}){
 const actor=await pageActor(),{id}=await params,p=await searchParams,q=accountsQuery.safeParse({agencyId:id,environment:p.environment??'MANUAL',page:p.page??1});if(!q.success)notFound();const list=await getOwnerAccounts(actor,q.data).catch(e=>{if(e instanceof DomainError&&[403,404].includes(e.status))notFound();throw e;});
 return <Workspace actor={actor}><Link className="back-link" href={`/agency/${id}`}>Back to agency</Link><h1>Owner earnings and payouts</h1><p>Review owner withdrawal requests, reserve available earnings and record payout separately. Maintenance reserves stay outside owner withdrawals.</p><OwnerAccountDirectory list={list} base={`/agency/${id}/accounting`}/></Workspace>;
}
