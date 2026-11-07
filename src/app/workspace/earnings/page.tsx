import {Workspace} from '@/components/workspace';
import {OwnerAccountDirectory} from '@/components/owner-account-directory';
import {pageActor} from '@/lib/page-actor';
import {getOwnerAccounts,accountsQuery} from '@/modules/accounting/owner-accounts';
import {notFound} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{environment?:string|string[];page?:string|string[]}>}){
 const actor=await pageActor(),p=await searchParams,q=accountsQuery.safeParse({environment:p.environment??'MANUAL',page:p.page??1});if(!q.success)notFound();const list=await getOwnerAccounts(actor,q.data);
 return <Workspace actor={actor}><h1>My vehicle earnings</h1><p>Follow your original owner allocation from each agency, request available earnings and review recorded payouts.</p><OwnerAccountDirectory list={list} base="/workspace/earnings"/></Workspace>;
}
