import type {PoolClient} from 'pg';
import {db} from '../../lib/db';
import {digest} from '../cart/pricing';
import {DomainError} from '../partners/workflow';
import {platformPayload,type PlatformTerms} from './schema';
type Reader=Pick<PoolClient,'query'>;
export async function readPolicy(c:Reader=db,revision?:number){
 const row=(await c.query(revision===undefined?'SELECT r.* FROM platform_policy p JOIN platform_policy_revision r ON r.revision=p.revision WHERE p.singleton':'SELECT * FROM platform_policy_revision WHERE revision=$1',revision===undefined?[]:[revision])).rows[0];
 if(!row)throw new DomainError('Platform policy version not found.',404);
 const payload=platformPayload.parse(row.payload);if(digest(payload)!==row.digest)throw new DomainError('Platform policy integrity check failed.',409);
 return {revision:Number(row.revision),digest:row.digest as string,payload,publishedAt:(row.created_at as Date).toISOString()};
}
export async function readPlatformTerms(c:Reader):Promise<PlatformTerms>{const p=await readPolicy(c);return {revision:p.revision,digest:p.digest,title:p.payload.termsTitle,text:p.payload.termsText};}
