import {auth} from '../../lib/auth';
import {db} from '../../lib/db';
import {DomainError} from '../partners/workflow';
/** Restricted access for a blocked person's OWN privacy/status portal only.
 * All operational routes continue to use requireActor/storedActor. */
export async function privacyIdentity(){
 const {data,error}=await auth.getSession({query:{disableCookieCache:true}}),u=data?.user;
 if(error||!u)throw new DomainError('Sign in to review your account status.',401);
 await db.query('INSERT INTO app_actor(id,email,name)VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET email=excluded.email WHERE app_actor.email IS DISTINCT FROM excluded.email',[u.id,u.email,u.name||'Rent2Go user']);
 const row=(await db.query('SELECT id,name,email,role,suspended,governance_version FROM app_actor WHERE id=$1 AND NOT is_test_fixture',[u.id])).rows[0];if(!row)throw new DomainError('Account status unavailable.',403);
 return {id:row.id as string,name:row.name as string,email:row.email as string,role:row.role,suspended:row.suspended as boolean,version:row.governance_version as number};
}
