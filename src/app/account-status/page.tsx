import {Workspace} from '@/components/workspace';
import {AccountPrivacy} from '@/components/account-privacy';
import {redirect,notFound} from 'next/navigation';
import {privacyIdentity} from '@/modules/governance/identity';
import {privacyQuery} from '@/modules/governance/schema';
import {DomainError} from '@/modules/partners/workflow';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const user=await privacyIdentity().catch(e=>{if(e instanceof DomainError&&e.status===401)redirect('/login');throw e;}),query=privacyQuery.safeParse(await searchParams);if(!query.success)notFound();
 if(!user.suspended)redirect(`/workspace/account?${new URLSearchParams({section:'privacy',view:query.data.view,page:String(query.data.page)})}`);
 return <Workspace actor={user} limited><AccountPrivacy user={user} query={query.data} limited/></Workspace>;
}
