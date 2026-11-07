import Link from 'next/link';
import {notFound} from 'next/navigation';
import {Workspace} from '@/components/workspace';
import {pageActor} from '@/lib/page-actor';
import {getPrivacyCase} from '@/modules/governance/privacy';
import {PrivacyCaseReview} from '@/components/privacy-case';
import {DomainError} from '@/modules/partners/workflow';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}){
 const actor=await pageActor();if(actor.role!=='SUPER_ADMIN')notFound();const d=await getPrivacyCase(actor,(await params).id).catch(e=>{if(e instanceof DomainError&&[403,404].includes(e.status))notFound();throw e;});
 return <Workspace actor={actor}><Link className="back-link" href="/admin/privacy">Back to privacy review queue</Link><h1>Privacy request review</h1><p>Requester: {d.requesterName}. Your own requests require another reviewer.</p><PrivacyCaseReview key={d.id} initial={d}/></Workspace>;
}
