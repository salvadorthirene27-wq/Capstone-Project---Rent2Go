import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {transaction} from '../../lib/db';
import {storedActor,audit} from '../partners/service';
import {DomainError,type Actor} from '../partners/workflow';
import {digest} from '../cart/pricing';
import {publishPolicy} from './schema';
import {readPolicy} from './read';
async function admin(c:PoolClient,actor:Actor){const u=await storedActor(actor,c);if(u.role!=='SUPER_ADMIN'||(await c.query('SELECT is_test_fixture FROM app_actor WHERE id=$1',[u.id])).rows[0]?.is_test_fixture)throw new DomainError('Platform settings access is required.',403);return u;}
async function view(c:PoolClient){
 const policy=await readPolicy(c),pointer=(await c.query('SELECT version FROM platform_policy WHERE singleton')).rows[0];
 const history=(await c.query('SELECT revision,digest,reason,created_at FROM platform_policy_revision ORDER BY revision DESC LIMIT 20')).rows.map(r=>({revision:Number(r.revision),digest:r.digest as string,reason:r.reason as string,publishedAt:(r.created_at as Date).toISOString()}));
 const days=policy.payload.inactiveEvidenceReviewDays;
 const reviewCandidates=days===null?null:Number((await c.query("SELECT count(*) n FROM booking_requirement_file f JOIN booking_request r ON r.id=f.request_id WHERE r.status IN ('COMPLETED','CANCELLED','REJECTED') AND f.created_at<clock_timestamp()-$1::int*interval '1 day' AND NOT EXISTS(SELECT 1 FROM booking_requirement_selection s WHERE s.file_id=f.id) AND NOT EXISTS(SELECT 1 FROM booking_ocr_command o WHERE o.file_id=f.id)",[days])).rows[0].n);
 return {...policy,version:Number(pointer.version),history,reviewCandidates};
}
export type PlatformSettings=Awaited<ReturnType<typeof getPlatformSettings>>;
export async function getPlatformSettings(actor:Actor){return transaction(async c=>{await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');await admin(c,actor);return view(c);});}
export async function publishPlatformSettings(actor:Actor,input:unknown){const command=publishPolicy.parse(input);return transaction(async c=>{
 // The one publication lock precedes the actor lock in every publication.
 await c.query('SELECT revision FROM platform_policy WHERE singleton FOR UPDATE');await c.query('SELECT id FROM app_actor WHERE id=$1 FOR SHARE',[actor.id]);const u=await admin(c,actor),hash=digest(command),retry=(await c.query('SELECT digest FROM platform_policy_command WHERE actor_id=$1 AND request_key=$2',[u.id,command.idempotencyKey])).rows[0];
 if(retry){if(retry.digest!==hash)throw new DomainError('This retry key belongs to different platform settings.',409);return view(c);}
 const current=await view(c);if(current.version!==command.version||current.digest!==command.digest)throw new DomainError('Platform settings changed. Refresh and review the current version.',409);
 const nextDigest=digest(command.payload);if(nextDigest===current.digest)throw new DomainError('Change the settings before publishing a new version.',409);
 const revision=current.revision+1,commandId=randomUUID();
 await c.query('INSERT INTO platform_policy_revision(revision,payload,digest,created_by,reason)VALUES($1,$2,$3,$4,$5)',[revision,command.payload,nextDigest,u.id,command.reason]);
 await c.query('UPDATE platform_policy SET revision=$1,version=version+1,updated_at=clock_timestamp() WHERE singleton',[revision]);
 await c.query('INSERT INTO platform_policy_command(id,actor_id,request_key,digest,revision)VALUES($1,$2,$3,$4,$5)',[commandId,u.id,command.idempotencyKey,hash,revision]);await audit(c,u,'PLATFORM_POLICY_PUBLISHED',commandId,{revision});return view(c);
 });}
