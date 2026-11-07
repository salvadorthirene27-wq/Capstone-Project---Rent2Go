import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {transaction} from '../../lib/db';
import {uuid} from '../../lib/http';
import {DomainError,type Actor} from '../partners/workflow';
import {digest} from '../cart/pricing';
import {audit} from '../partners/service';
import {privacyQuery,privacyCreate,privacyAction} from './schema';
import {notifyPrivacy} from './notifications';
import {deactivationBlockers} from './blockers';
async function person(c:PoolClient,id:string){const row=(await c.query('SELECT id,name,email,role,suspended,governance_version FROM app_actor WHERE id=$1 AND NOT is_test_fixture',[id])).rows[0];if(!row)throw new DomainError('Account unavailable.',403);return row;}
const reviewer=(u:any)=>u.role==='SUPER_ADMIN'&&!u.suspended;
const caseSql='SELECT p.*,s.version,s.status,s.updated_at FROM privacy_case p JOIN privacy_case_state s ON s.case_id=p.id';
async function record(c:PoolClient,actor:Actor,id:string){
 const user=await person(c,actor.id),r=(await c.query(`${caseSql} WHERE p.id=$1`,[id])).rows[0];if(!r||r.actor_id!==user.id&&!reviewer(user))throw new DomainError('Privacy request not found.',404);
 const own=r.actor_id===user.id,subject=await person(c,r.actor_id),events=(await c.query('SELECT version,action,message,body,created_at FROM privacy_case_event WHERE case_id=$1 ORDER BY version',[id])).rows;
 const terms={id,kind:r.kind,message:r.message,requestedName:r.requested_name,requesterId:subject.id,version:r.version,status:r.status};
 return {...terms,digest:digest(terms),createdAt:(r.created_at as Date).toISOString(),requesterName:subject.name as string,isOwn:own,canReview:reviewer(user)&&!own&&['OPEN','WAITING_USER'].includes(r.status),canReply:own&&r.status==='WAITING_USER',canWithdraw:own&&['OPEN','WAITING_USER'].includes(r.status),events:events.map(e=>({version:e.version as number,action:e.action as string,message:e.message as string,body:e.body as Record<string,unknown>,createdAt:(e.created_at as Date).toISOString()})),blockers:!own&&reviewer(user)&&['REMOVAL','DEACTIVATION'].includes(r.kind)&&r.status==='OPEN'?await deactivationBlockers(c,subject.id):[]};
}
export async function getPrivacyCase(actor:Actor,id:string){return transaction(async c=>{await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');return record(c,actor,uuid.parse(id));});}
export type PrivacyCase=Awaited<ReturnType<typeof getPrivacyCase>>;
export async function getPrivacyCases(actor:Actor,input:unknown={},admin=false){return transaction(async c=>{
 await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const u=await person(c,actor.id),q=privacyQuery.parse(input);if(admin&&!reviewer(u))throw new DomainError('Platform privacy review access is required.',403);
 const condition="($1::boolean OR p.actor_id=$2) AND ($3::text='ALL' OR s.status IN('OPEN','WAITING_USER'))",params=[admin,u.id,q.view],rows=(await c.query(`${caseSql.replace('SELECT p.*','SELECT p.*,(SELECT name FROM app_actor WHERE id=p.actor_id) requester_name')} WHERE ${condition} ORDER BY s.updated_at DESC,p.id DESC LIMIT 20 OFFSET $4`,[...params,(q.page-1)*20])).rows,total=Number((await c.query(`SELECT count(*) n FROM privacy_case p JOIN privacy_case_state s ON s.case_id=p.id WHERE ${condition}`,params)).rows[0].n);
 return {page:q.page,pageCount:Math.max(1,Math.ceil(total/20)),view:q.view,admin,items:rows.map(r=>({id:r.id as string,requesterName:admin?r.requester_name as string:null,kind:r.kind as string,status:r.status as string,createdAt:(r.created_at as Date).toISOString(),updatedAt:(r.updated_at as Date).toISOString()})),account:{name:u.name as string,suspended:u.suspended as boolean}};
});}
async function governanceLock(c:PoolClient,ids:string[]){await c.query('SELECT pg_advisory_xact_lock(481038)');await c.query('SELECT id FROM app_actor WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE',[[...new Set(ids)].sort()]);}
async function retry(c:PoolClient,actorId:string,key:string,hash:string){const old=(await c.query('SELECT case_id,digest FROM privacy_case_command WHERE actor_id=$1 AND request_key=$2',[actorId,key])).rows[0];if(old&&old.digest!==hash)throw new DomainError('This retry key belongs to another privacy action.',409);return old?.case_id as string|undefined;}
export async function createPrivacyCase(actor:Actor,input:unknown){const command=privacyCreate.parse(input);return transaction(async c=>{
 await governanceLock(c,[actor.id]);const u=await person(c,actor.id),hash=digest(command),old=await retry(c,u.id,command.idempotencyKey,hash);if(old)return record(c,u,old);
 if(command.kind==='REACTIVATION'&&!u.suspended)throw new DomainError('This account already has active workspace access.',409);
 if(['DEACTIVATION','REMOVAL'].includes(command.kind)&&u.suspended)throw new DomainError('Workspace access is already disabled. You can request access information or reactivation.',409);
 if((await c.query("SELECT 1 FROM privacy_case p JOIN privacy_case_state s ON s.case_id=p.id WHERE p.actor_id=$1 AND p.kind=$2 AND s.status IN('OPEN','WAITING_USER')",[u.id,command.kind])).rowCount)throw new DomainError('Continue the existing open request of this type.',409);
 const id=randomUUID();await c.query('INSERT INTO privacy_case(id,actor_id,kind,message,requested_name)VALUES($1,$2,$3,$4,$5)',[id,u.id,command.kind,command.message,command.requestedName??null]);await c.query('INSERT INTO privacy_case_state(case_id)VALUES($1)',[id]);await c.query('INSERT INTO privacy_case_command(id,case_id,actor_id,request_key,digest)VALUES($1,$2,$3,$4,$5)',[randomUUID(),id,u.id,command.idempotencyKey,hash]);await audit(c,u,'PRIVACY_REQUEST_CREATED',id,{kind:command.kind});await notifyPrivacy(c,id);return record(c,u,id);
});}
async function applyApproved(c:PoolClient,admin:Actor,subject:any,r:any,message:string){
 if(r.kind==='ACCESS')return {outcome:'ACCOUNT_SUMMARY',summary:{name:subject.name,email:subject.email,role:subject.role,workspaceAccess:subject.suspended?'DISABLED':'ACTIVE'},statement:'This summary covers the current account profile. Bookings and financial statements remain available only through their separately authorized workflows.'};
 const action=r.kind==='CORRECTION'?'CORRECT_NAME':r.kind==='REACTIVATION'?'REACTIVATE':'DEACTIVATE';
 if(action==='DEACTIVATE'){
  const blockers=await deactivationBlockers(c,subject.id);if(blockers.length)throw new DomainError('Existing obligations must be resolved before deactivation. Review the displayed blockers.',409);
  if(subject.suspended)throw new DomainError('This account is already unavailable.',409);
 }else if(action==='REACTIVATE'&&!subject.suspended)throw new DomainError('This account is already active.',409);
 if(action==='CORRECT_NAME'&&subject.name===r.requested_name)throw new DomainError('The current display name already matches this request. Explain the result instead of applying the same change again.',409);
 const next=action==='CORRECT_NAME'?(await c.query('UPDATE app_actor SET name=$2 WHERE id=$1 RETURNING governance_version',[subject.id,r.requested_name])).rows[0]:(await c.query('UPDATE app_actor SET suspended=$2 WHERE id=$1 RETURNING governance_version',[subject.id,action==='DEACTIVATE'])).rows[0];
 const body=action==='CORRECT_NAME'?{outcome:'DISPLAY_NAME_CORRECTED',displayName:r.requested_name,statement:'Historical agreements, payment records and earlier identity evidence retain their original snapshots.'}:{outcome:action==='REACTIVATE'?'WORKSPACE_ACCESS_RESTORED':'DEACTIVATED_RECORDS_RETAINED',statement:action==='REACTIVATE'?'Workspace access is restored. Existing agency approvals and resource availability remain governed by their own workflows.':'Workspace access is deactivated. Existing booking, financial, agreement, consent and necessary evidence history is retained; this is not confirmation of data erasure. A limited account-status and privacy-review portal remains available.'};
 await c.query('INSERT INTO account_governance_event(id,subject_id,actor_id,case_id,action,reason,before_version,after_version,body)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[randomUUID(),subject.id,admin.id,r.id,action,message,subject.governance_version,next.governance_version,body]);return body;
}
export async function changePrivacyCase(actor:Actor,idInput:string,input:unknown){const id=uuid.parse(idInput),command=privacyAction.parse(input);return transaction(async c=>{
 await c.query('SELECT pg_advisory_xact_lock(481038)');const raw=(await c.query('SELECT actor_id FROM privacy_case WHERE id=$1',[id])).rows[0];if(!raw)throw new DomainError('Privacy request not found.',404);await governanceLock(c,[actor.id,raw.actor_id]);const u=await person(c,actor.id),subject=await person(c,raw.actor_id),r=(await c.query(`${caseSql} WHERE p.id=$1 FOR UPDATE OF s`,[id])).rows[0],own=u.id===subject.id;
 if(!own&&!reviewer(u))throw new DomainError('Privacy request not found.',404);const hash=digest({id,command}),old=await retry(c,u.id,command.idempotencyKey,hash);if(old)return record(c,u,old);
 const current=await record(c,u,id);if(r.version!==command.version||current.digest!==command.digest)throw new DomainError('This privacy request changed. Review the saved terms again.',409);
 if(['RESOLVED','REJECTED','WITHDRAWN'].includes(r.status))throw new DomainError('This privacy request is already closed.',409);
 const review=['APPROVE','REJECT','REQUEST_INFO'].includes(command.action);if(review&&(own||!reviewer(u))||!review&&!own)throw new DomainError('The exact independent privacy participant is required.',403);
 if(command.action==='REPLY'&&r.status!=='WAITING_USER'||command.action==='REQUEST_INFO'&&r.status!=='OPEN'||command.action==='APPROVE'&&r.status!=='OPEN')throw new DomainError('This action is unavailable in the current review state.',409);
 if(command.action==='REQUEST_INFO'&&r.version>=99)throw new DomainError('This request reached its information-review limit. Resolve or decline it with an explanation before creating a new request.',409);
 const body=command.action==='APPROVE'?await applyApproved(c,u,subject,r,command.message):{},status={REQUEST_INFO:'WAITING_USER',REPLY:'OPEN',APPROVE:'RESOLVED',REJECT:'REJECTED',WITHDRAW:'WITHDRAWN'}[command.action];
 await c.query('UPDATE privacy_case_state SET status=$2,version=version+1,updated_at=clock_timestamp() WHERE case_id=$1',[id,status]);await c.query('INSERT INTO privacy_case_event(id,case_id,version,actor_id,action,message,body)VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),id,r.version+1,u.id,command.action,command.message,body]);await c.query('INSERT INTO privacy_case_command(id,case_id,actor_id,request_key,digest)VALUES($1,$2,$3,$4,$5)',[randomUUID(),id,u.id,command.idempotencyKey,hash]);await audit(c,u,'PRIVACY_REQUEST_'+command.action,id,{kind:r.kind,outcome:status});await notifyPrivacy(c,id);return record(c,u,id);
});}

export async function getOwnAccessHistory(actor:Actor){return transaction(async c=>{await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const u=await person(c,actor.id);return (await c.query('SELECT action,reason,body,created_at FROM account_governance_event WHERE subject_id=$1 ORDER BY created_at DESC,id DESC LIMIT 20',[u.id])).rows.map(r=>({action:r.action as string,reason:r.reason as string,statement:typeof r.body?.statement==='string'?r.body.statement:null,createdAt:(r.created_at as Date).toISOString()}));});}
