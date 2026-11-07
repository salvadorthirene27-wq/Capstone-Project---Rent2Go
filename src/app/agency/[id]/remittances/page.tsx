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
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{environment?:string|string[]}>}){
 const actor=await pageActor(),id=(await params).id,p=await searchParams,scope=remittanceScope.safeParse({agencyId:id,environment:p.environment??'MANUAL'});if(!scope.success)notFound();const ctx=await transaction(async c=>{await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');return remittanceContext(c,actor,scope.data);}).catch(e=>{if(e instanceof DomainError&&[403,404].includes(e.status))notFound();throw e;});if(!ctx.operator)notFound();
 return <Workspace actor={actor}><Link className="back-link" href={`/agency/${id}`}>Back to agency overview</Link><h1>Rent2Go commissions & remittances</h1><AccountEnvironment environment={scope.data.environment}/><RemittanceAccount key={scope.data.environment} scope={scope.data}/></Workspace>;
}
