import Link from 'next/link';
import {notFound} from 'next/navigation';
import {Workspace} from '@/components/workspace';
import {RemittanceAccount} from '@/components/remittance-account';
import {AccountEnvironment} from '@/components/owner-account-directory';
import {pageActor} from '@/lib/page-actor';
import {transaction} from '@/lib/db';
import {remittanceContext} from '@/modules/accounting/remittance-source';
import {remittanceScope} from '@/modules/accounting/remittance-schema';
import {DomainError} from '@/modules/partners/workflow';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{agencyId:string}>;searchParams:Promise<{environment?:string|string[]}>}){
 const actor=await pageActor(),p=await searchParams,scope=remittanceScope.safeParse({agencyId:(await params).agencyId,environment:p.environment??'MANUAL'});if(!scope.success)notFound();if(actor.role!=='SUPER_ADMIN')notFound();await transaction(async c=>{await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');await remittanceContext(c,actor,scope.data);}).catch(e=>{if(e instanceof DomainError&&[403,404].includes(e.status))notFound();throw e;});
 return <Workspace actor={actor}><Link className="back-link" href={`/admin/remittances?environment=${scope.data.environment}`}>Back to agency remittances</Link><h1>Platform remittance review</h1><AccountEnvironment environment={scope.data.environment}/><RemittanceAccount key={scope.data.environment} scope={scope.data}/></Workspace>;
}
