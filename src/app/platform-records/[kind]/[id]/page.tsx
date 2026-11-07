import Link from 'next/link';
import {notFound} from 'next/navigation';
import {pageActor} from '@/lib/page-actor';
import {uuid} from '@/lib/http';
import {getPlatformRecord,platformRecordKind} from '@/modules/accounting/remittance-records';
import {DomainError} from '@/modules/partners/workflow';
import {PlatformRecordDocument} from '@/components/platform-record-document';
import {PrintButton} from '@/components/print-button';
import '../../../booking-agreements/[id]/print.css';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{kind:string;id:string}>}){
 const actor=await pageActor(),p=await params,kind=platformRecordKind.safeParse(p.kind),id=uuid.safeParse(p.id);if(!kind.success||!id.success)notFound();
 const data=await getPlatformRecord(actor,kind.data,id.data).catch(e=>{if(e instanceof DomainError&&[403,404].includes(e.status))notFound();throw e;});
 return <main id="main-content" className="agreement-print-page"><nav className="agreement-print-controls" aria-label="Platform record actions"><Link className="button secondary" href={data.backHref}>Back to remittance account</Link><PrintButton/></nav><PlatformRecordDocument data={data}/></main>;
}
