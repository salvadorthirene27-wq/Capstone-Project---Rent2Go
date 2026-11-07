import {Workspace} from '@/components/workspace';
import {AccountSecurity} from '@/components/account-security';
import {pageActor} from '@/lib/page-actor';
import {accountIdentity} from '@/modules/account/service';
export const dynamic='force-dynamic';
export default async function Page(){const actor=await pageActor();return <Workspace actor={actor}><AccountSecurity key={actor.id} initial={await accountIdentity()}/></Workspace>;}
