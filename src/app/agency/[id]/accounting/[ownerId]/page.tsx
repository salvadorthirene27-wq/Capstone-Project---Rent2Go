import Link from 'next/link';
import {notFound} from 'next/navigation';
import {Workspace} from '@/components/workspace';
import {OwnerAccount} from '@/components/owner-account';
import {AccountEnvironment} from '@/components/owner-account-directory';
import {pageActor} from '@/lib/page-actor';
import {authorizeOwnerAccountView} from '@/modules/accounting/owner-accounts';
import {accountScope} from '@/modules/accounting/schema';
import {DomainError} from '@/modules/partners/workflow';
import {requireAgencyAccess} from '@/modules/agencies/service';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{id:string;ownerId:string}>;searchParams:Promise<{environment?:string|string[]}>}){
 const actor=await pageActor(),{id,ownerId}=await params,p=await searchParams,scope=accountScope.safeParse({agencyId:id,ownerId,environment:p.environment??'MANUAL'});if(!scope.success)notFound();await requireAgencyAccess(actor,id).catch(e=>{if(e instanceof DomainError&&[403,404].includes(e.status))notFound();throw e;});await authorizeOwnerAccountView(actor,scope.data).catch(e=>{if(e instanceof DomainError&&[403,404].includes(e.status))notFound();throw e;});
 return <Workspace actor={actor}><Link className="back-link" href={`/agency/${id}/accounting?environment=${scope.data.environment}`}>Back to owner accounts</Link><h1>Owner account review</h1><AccountEnvironment environment={scope.data.environment}/><OwnerAccount key={`${ownerId}:${scope.data.environment}`} scope={scope.data}/></Workspace>;
}
