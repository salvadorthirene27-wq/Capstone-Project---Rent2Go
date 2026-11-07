import {auth,requireActor} from '../../lib/auth';
import {DomainError} from '../partners/workflow';
export async function accountIdentity(){
 const actor=await requireActor(),session=await auth.getSession({query:{disableCookieCache:true}});
 if(session.error||!session.data?.user||session.data.user.id!==actor.id)throw new DomainError('Sign in again to manage your account.',401);
 const user=session.data.user;
 return {id:actor.id,email:user.email,name:user.name,role:actor.role,emailVerified:user.emailVerified};
}
export type AccountIdentity=Awaited<ReturnType<typeof accountIdentity>>;
