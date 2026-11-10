import {accountPreferences} from '@/modules/account/preferences';
import {AccountProfile} from '@/components/account-profile';
import {Workspace} from '@/components/workspace';
import {AccountSecurity} from '@/components/account-security';
import {AccountPrivacy} from '@/components/account-privacy';
import {pageActor} from '@/lib/page-actor';
import {db} from '@/lib/db';
import {accountIdentity} from '@/modules/account/service';
import {privacyIdentity} from '@/modules/governance/identity';
import {DomainError} from '@/modules/partners/workflow';
import {redirect,notFound} from 'next/navigation';
import {parseOnboardingPath} from '@/modules/account/onboarding';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const query=await searchParams,section=query.section??'security';if(section!=='security'&&section!=='privacy'&&section!=='profile'&&section!=='payment')notFound();
 if(section==='privacy'){
  const user=await privacyIdentity().catch(e=>{if(e instanceof DomainError&&e.status===401)redirect('/login');throw e;});if(user.suspended)redirect('/account-status');
  const filters=Object.fromEntries(Object.entries(query).filter(([key])=>key!=='section'));
  return <Workspace actor={user}><AccountPrivacy user={user} query={filters}/></Workspace>;
 }
 const actor=await pageActor();
 if(section==='profile'||section==='payment'){
  const [identity,preferences,photo]=await Promise.all([
   accountIdentity(),
   accountPreferences(actor),
   section==='profile' ? db.query<{revision:string}>('SELECT revision FROM account_photo WHERE actor_id=$1',[actor.id]) : null,
  ]);
  return <Workspace actor={actor}><AccountProfile key={`${actor.id}:${section}`} identity={identity} initial={preferences} payment={section==='payment'} photoRevision={photo?.rows[0]?.revision??null}/></Workspace>;
 }
 return <Workspace actor={actor}><AccountSecurity key={actor.id} initial={await accountIdentity()} onboarding={parseOnboardingPath(query.onboarding)}/></Workspace>;
}
