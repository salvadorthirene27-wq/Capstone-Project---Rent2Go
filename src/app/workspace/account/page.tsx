import {Workspace} from '@/components/workspace';
import {AccountSecurity} from '@/components/account-security';
import {AccountPrivacy} from '@/components/account-privacy';
import {pageActor} from '@/lib/page-actor';
import {accountIdentity} from '@/modules/account/service';
import {privacyIdentity} from '@/modules/governance/identity';
import {DomainError} from '@/modules/partners/workflow';
import {redirect,notFound} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const query=await searchParams,section=query.section??'security';if(section!=='security'&&section!=='privacy')notFound();
 if(section==='privacy'){
  const user=await privacyIdentity().catch(e=>{if(e instanceof DomainError&&e.status===401)redirect('/login');throw e;});if(user.suspended)redirect('/account-status');
  const filters=Object.fromEntries(Object.entries(query).filter(([key])=>key!=='section'));
  return <Workspace actor={user}><AccountPrivacy user={user} query={filters}/></Workspace>;
 }
 const actor=await pageActor();return <Workspace actor={actor}><AccountSecurity key={actor.id} initial={await accountIdentity()}/></Workspace>;
}
