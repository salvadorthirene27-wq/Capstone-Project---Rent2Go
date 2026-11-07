import Link from 'next/link';
import {notFound} from 'next/navigation';
import {Workspace} from '@/components/workspace';
import {UserGovernance} from '@/components/user-governance';
import {pageActor} from '@/lib/page-actor';
import {getGovernanceUser} from '@/modules/governance/users';
import {DomainError} from '@/modules/partners/workflow';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}){const actor=await pageActor(),d=await getGovernanceUser(actor,(await params).id).catch(e=>{if(e instanceof DomainError&&[403,404].includes(e.status))notFound();throw e;});return <Workspace actor={actor}><Link className="back-link" href="/admin/users">Back to user accounts</Link><h1>Review user access</h1><UserGovernance key={d.id} initial={d}/></Workspace>;}
