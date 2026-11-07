import {notFound} from 'next/navigation';
import {Workspace} from '@/components/workspace';
import {PlatformSettingsEditor} from '@/components/platform-settings';
import {pageActor} from '@/lib/page-actor';
import {getPlatformSettings} from '@/modules/platform/service';
import {DomainError} from '@/modules/partners/workflow';
export const dynamic='force-dynamic';
export default async function Page(){const actor=await pageActor(),data=await getPlatformSettings(actor).catch(e=>{if(e instanceof DomainError&&e.status===403)notFound();throw e;});return <Workspace actor={actor}><h1>Platform settings</h1><p>Publish starting agency shares, marketplace terms, help answers and evidence-review criteria. Each publication keeps an immutable version and its review reason.</p><PlatformSettingsEditor initial={data}/></Workspace>;}
