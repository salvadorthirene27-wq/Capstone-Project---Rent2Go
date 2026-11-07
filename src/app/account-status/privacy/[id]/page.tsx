import Link from 'next/link';
import {redirect,notFound} from 'next/navigation';
import {privacyIdentity} from '@/modules/governance/identity';
import {getPrivacyCase} from '@/modules/governance/privacy';
import {PrivacyCaseReview} from '@/components/privacy-case';
import {DomainError} from '@/modules/partners/workflow';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}){
 const u=await privacyIdentity().catch(e=>{if(e instanceof DomainError&&e.status===401)redirect('/login');throw e;}),data=await getPrivacyCase(u,(await params).id).catch(e=>{if(e instanceof DomainError&&[403,404].includes(e.status))notFound();throw e;});if(!data.isOwn)notFound();
 return <main id="main-content" className="account-status-page"><Link className="back-link" href="/account-status?view=ALL">Back to your account requests</Link><h1>Your privacy request</h1><PrivacyCaseReview key={data.id} initial={data}/></main>;
}
