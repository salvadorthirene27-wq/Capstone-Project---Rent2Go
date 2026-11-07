import Link from 'next/link';
import {notFound} from 'next/navigation';
import {Workspace} from '@/components/workspace';
import {RemittanceDirectory} from '@/components/remittance-directory';
import {pageActor} from '@/lib/page-actor';
import {getRemittanceDirectory} from '@/modules/accounting/remittance-directory';
import {DomainError} from '@/modules/partners/workflow';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const actor=await pageActor(),data=await getRemittanceDirectory(actor,await searchParams).catch(e=>{if(e instanceof DomainError&&[403,404].includes(e.status))notFound();throw e;});
 return <Workspace actor={actor}><Link className="back-link" href="/admin">Back to platform workspace</Link><h1>Agency remittances</h1><p>Review platform dues, payment claims, confirmed receipts and accepted agency credits. Each agency and payment environment is accounted for separately.</p><RemittanceDirectory data={data}/></Workspace>;
}
