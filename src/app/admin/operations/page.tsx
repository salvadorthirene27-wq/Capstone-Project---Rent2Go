import Link from 'next/link';
import {notFound} from 'next/navigation';
import {Workspace} from '@/components/workspace';
import {OperationsOverview} from '@/components/operations-overview';
import {pageActor} from '@/lib/page-actor';
import {getOperations} from '@/modules/operations/service';
import {DomainError} from '@/modules/partners/workflow';
export const dynamic='force-dynamic';
export default async function Page(){
 const actor=await pageActor(),data=await getOperations(actor).catch(e=>{if(e instanceof DomainError&&[403,404].includes(e.status))notFound();throw e;});
 return <Workspace actor={actor}><Link className="back-link" href="/admin">Back to platform workspace</Link><h1>Service health</h1><a className="button secondary" href="/admin/operations">Refresh service health</a><OperationsOverview data={data}/></Workspace>;
}
