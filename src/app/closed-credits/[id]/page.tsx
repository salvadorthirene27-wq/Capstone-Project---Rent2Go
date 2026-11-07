import Link from 'next/link';
import {notFound} from 'next/navigation';
import {Workspace} from '@/components/workspace';
import {ClosedCreditReview} from '@/components/closed-credits';
import {pageActor} from '@/lib/page-actor';
import {uuid} from '@/lib/http';
import {getClosedCredit} from '@/modules/accounting/closed-credits';
import {DomainError} from '@/modules/partners/workflow';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}){
 const actor=await pageActor(),id=uuid.safeParse((await params).id);if(!id.success)notFound();
 const data=await getClosedCredit(actor,id.data).catch(e=>{if(e instanceof DomainError&&[403,404].includes(e.status))notFound();throw e;});
 return <Workspace actor={actor}><Link className="back-link" href={data.backHref}>{data.isOwner?'Back to my earnings':'Back to booking request'}</Link><h1>{data.isOwner?'Review your earnings credit':'Closed-booking credit'}</h1><ClosedCreditReview initial={data}/></Workspace>;
}
