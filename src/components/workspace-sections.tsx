"use client";
import Link from 'next/link';
import {usePathname,useSearchParams} from 'next/navigation';
export const vehicleWorkspacePaths=['/workspace/vehicles','/workspace/resources','/workspace/earnings','/workspace/reports'];
export function WorkspaceSections(){
 const path=usePathname(),query=useSearchParams(),vehicles=vehicleWorkspacePaths.some(p=>path===p||path.startsWith(p+'/')),account=path==='/workspace/account'||path.startsWith('/account-status');
 if(!vehicles&&!account)return null;
 const environment=query.get('environment'),suffix=environment==='DEMO'||environment==='MANUAL'?`?environment=${environment}`:'';
 const links=vehicles?[{href:'/workspace/vehicles'+suffix,label:'Vehicles'},{href:'/workspace/resources'+suffix,label:'Calendars'},{href:'/workspace/earnings'+suffix,label:'Earnings'},{href:'/workspace/reports'+suffix,label:'Reports'}]:[{href:'/workspace/account',label:'Security'},{href:'/workspace/account?section=privacy',label:'Privacy & requests'}];
 const current=(href:string)=>vehicles?path===href.split('?')[0]||path.startsWith(href.split('?')[0]+'/'):href.includes('section=privacy')?(path.startsWith('/account-status')||query.get('section')==='privacy'):path==='/workspace/account'&&query.get('section')!=='privacy';
 return <section className="workspace-section-nav" aria-label={vehicles?'My vehicles workspace':'Account workspace'}><p className="eyebrow">{vehicles?'My vehicles':'Your account'}</p><nav aria-label={vehicles?'Vehicle workspace sections':'Account sections'}>{links.map(link=><Link key={link.href} href={link.href} aria-current={current(link.href)?'page':undefined}>{link.label}</Link>)}</nav></section>;
}
