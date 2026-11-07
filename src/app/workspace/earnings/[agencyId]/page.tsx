import Link from 'next/link';
import {notFound} from 'next/navigation';
import {Workspace} from '@/components/workspace';
import {OwnerAccount} from '@/components/owner-account';
import {AccountEnvironment} from '@/components/owner-account-directory';
import {pageActor} from '@/lib/page-actor';
import {authorizeOwnerAccountView} from '@/modules/accounting/owner-accounts';
import {accountScope} from '@/modules/accounting/schema';
import {DomainError} from '@/modules/partners/workflow';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{agencyId:string}>;searchParams:Promise<{environment?:string|string[]}>}){
 const actor=await pageActor(),p=await searchParams,scope=accountScope.safeParse({agencyId:(await params).agencyId,ownerId:actor.id,environment:p.environment??'MANUAL'});if(!scope.success)notFound();await authorizeOwnerAccountView(actor,scope.data).catch(e=>{if(e instanceof DomainError&&[403,404].includes(e.status))notFound();throw e;});
 return <Workspace actor={actor}><Link className="back-link" href={`/workspace/earnings?environment=${scope.data.environment}`}>Back to my earnings</Link><h1>Owner earnings and withdrawals</h1><AccountEnvironment environment={scope.data.environment}/><OwnerAccount key={scope.data.environment} scope={scope.data}/></Workspace>;
}
