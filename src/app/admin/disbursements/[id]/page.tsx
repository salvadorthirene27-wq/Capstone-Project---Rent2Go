import {CentralFundingPanel} from '@/components/central-funding';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {Workspace} from '@/components/workspace';
import {CentralDisbursementPanel} from '@/components/central-disbursements';
import {pageActor} from '@/lib/page-actor';
import {getDisbursements} from '@/modules/gateway/disbursements';
import {DomainError} from '@/modules/partners/workflow';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}){const actor=await pageActor(),{id}=await params;if(actor.role!=='SUPER_ADMIN')notFound();const data=await getDisbursements(actor,id).catch(e=>{if(e instanceof DomainError&&[403,404].includes(e.status))notFound();throw e;});if(!data.isReviewer)notFound();return <Workspace actor={actor}><Link className="back-link" href="/admin/disbursements">Back to agency disbursements</Link><h1>Review agency disbursement</h1><CentralFundingPanel requestId={id}/><CentralDisbursementPanel requestId={id}/></Workspace>;}
