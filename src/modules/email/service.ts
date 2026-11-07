import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {transaction} from '../../lib/db';
import {audit,storedActor} from '../partners/service';
import {DomainError,type Actor} from '../partners/workflow';
import {notificationEmailPermitted} from '../notifications/service';
import {gmailSettings,inboxMail,sendInboxMail} from './provider';

export type EmailIdentity={id:string;email:string;emailVerified:boolean};
export const emailCommand=z.discriminatedUnion('action',[
 z.object({action:z.literal('PREFERENCE'),version:z.number().int().nonnegative(),enabled:z.boolean(),acknowledgement:z.literal(true)}).strict(),
 z.object({action:z.literal('RETRY'),messageId:z.uuid(),requestKey:z.uuid(),acknowledgement:z.literal(true)}).strict(),
]);
const emailQuery=z.object({page:z.coerce.number().int().min(1).max(100000).default(1)}).strict();

async function context(c:PoolClient,actor:Actor,lock=false){
 if(lock)await c.query('SELECT id FROM app_actor WHERE id=$1 FOR SHARE',[actor.id]);
 const user=await storedActor(actor,c);
 if((await c.query('SELECT is_test_fixture FROM app_actor WHERE id=$1',[user.id])).rows[0]?.is_test_fixture)throw new DomainError('Email settings are unavailable.',403);
 return user;
}
async function projection(c:PoolClient,user:Actor,identity:EmailIdentity,page:number){
 const preference=(await c.query('SELECT enabled,email,version FROM email_preference WHERE actor_id=$1',[user.id])).rows[0];
 const total=Number((await c.query('SELECT count(*) n FROM email_message WHERE recipient_id=$1',[user.id])).rows[0].n),pageCount=Math.max(1,Math.ceil(total/20));page=Math.min(page,pageCount);
 const rows=(await c.query(`SELECT m.id,m.source,m.created_at,m.preference_version,m.email,(m.created_at<clock_timestamp()-interval '7 days') expired,a.ordinal,a.dispatch_at,r.outcome,r.reason,r.created_at finished_at
 FROM email_message m JOIN LATERAL(SELECT * FROM email_attempt WHERE message_id=m.id ORDER BY ordinal DESC LIMIT 1)a ON true
 LEFT JOIN email_result r ON r.attempt_id=a.id WHERE m.recipient_id=$1 ORDER BY m.created_at DESC,m.id DESC LIMIT 20 OFFSET $2`,[user.id,(page-1)*20])).rows;
 return {enabled:preference?.enabled??false,version:preference?.version??0,email:identity.email,
  verified:identity.id===user.id&&identity.emailVerified&&identity.email.toLowerCase()===user.email?.toLowerCase(),
  sendingEnabled:process.env.EMAIL_SEND_ENABLED==='true',page,pageCount,total,
  items:rows.map(r=>({id:r.id as string,source:r.source as string,createdAt:(r.created_at as Date).toISOString(),attempts:r.ordinal as number,status:(r.outcome??(r.dispatch_at?'SENDING':'QUEUED')) as string,reason:(r.reason??'') as string,canRetry:Boolean(r.outcome==='REJECTED'&&r.ordinal<3&&!r.expired&&preference?.enabled&&preference.version===r.preference_version&&preference.email===r.email&&identity.emailVerified&&identity.email.toLowerCase()===r.email.toLowerCase()),finishedAt:r.finished_at?(r.finished_at as Date).toISOString():null}))};
}
export type EmailSettings=Awaited<ReturnType<typeof projection>>;
export async function getEmailSettings(actor:Actor,identity:EmailIdentity,input:unknown={}){
 if(identity.id!==actor.id)throw new DomainError('Sign in again before opening email settings.',403);
 const q=emailQuery.parse(input);return transaction(async c=>{await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');return projection(c,await context(c,actor),identity,q.page);});
}
export async function changeEmailSettings(actor:Actor,identity:EmailIdentity,input:unknown){
 if(identity.id!==actor.id)throw new DomainError('Sign in again before changing email settings.',403);
 const command=emailCommand.parse(input);
 return transaction(async c=>{
  const user=await context(c,actor,true);await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`email-preference:${user.id}`]);
  const p=(await c.query('SELECT * FROM email_preference WHERE actor_id=$1 FOR UPDATE',[user.id])).rows[0];
  if(command.action==='PREFERENCE'){
   if((p?.version??0)!==command.version)throw new DomainError('Email settings changed. Refresh before saving.',409);
   if(command.enabled&&(identity.id!==user.id||!identity.emailVerified||identity.email.toLowerCase()!==user.email?.toLowerCase()||!z.email().max(254).safeParse(identity.email).success))throw new DomainError('Verify your account email before enabling email updates.',409);
   await c.query(`INSERT INTO email_preference(actor_id,email,enabled,version)VALUES($1,$2,$3,1) ON CONFLICT(actor_id)DO UPDATE SET email=excluded.email,enabled=excluded.enabled,version=email_preference.version+1,updated_at=clock_timestamp()`,[user.id,command.enabled?identity.email:(p?.email??user.email),command.enabled]);
   await audit(c,user,'EMAIL_PREFERENCE',randomUUID(),{enabled:command.enabled,version:command.version+1});
  }else{
   const m=(await c.query("SELECT *,created_at<clock_timestamp()-interval '7 days' expired FROM email_message WHERE id=$1 AND recipient_id=$2 FOR UPDATE",[command.messageId,user.id])).rows[0];if(!m)throw new DomainError('This email record is unavailable.',404);
   const prior=(await c.query('SELECT message_id FROM email_attempt WHERE request_key=$1',[command.requestKey])).rows[0];
   if(prior){if(prior.message_id!==m.id)throw new DomainError('This retry key belongs to another email.',409);return projection(c,user,identity,1);}
   const last=(await c.query('SELECT a.ordinal,r.outcome FROM email_attempt a LEFT JOIN email_result r ON r.attempt_id=a.id WHERE a.message_id=$1 ORDER BY ordinal DESC LIMIT 1',[m.id])).rows[0];
   if(!p?.enabled||p.version!==m.preference_version||p.email!==m.email||identity.id!==user.id||!identity.emailVerified||identity.email.toLowerCase()!==m.email.toLowerCase()||!await notificationEmailPermitted(c,user,m.source,m.notification_id))throw new DomainError('Current email permission and source access are required.',409);
   if(last?.outcome!=='REJECTED'||last.ordinal>=3||m.expired)throw new DomainError('Only a rejected message from the last seven days with fewer than three attempts can be retried. An uncertain outcome cannot be resent.',409);
   await c.query('INSERT INTO email_attempt(id,message_id,ordinal,request_key)VALUES($1,$2,$3,$4)',[randomUUID(),m.id,last.ordinal+1,command.requestKey]);
   await audit(c,user,'EMAIL_RETRY',m.id,{attempt:last.ordinal+1});
  }
  return projection(c,user,identity,1);
 });
}

export async function recoverInterruptedEmails(){return transaction(async c=>{
 await c.query('SELECT pg_advisory_xact_lock(481029)');
 const recovered=await c.query("INSERT INTO email_result(attempt_id,outcome,reason) SELECT a.id,'UNKNOWN','INTERRUPTED' FROM email_attempt a WHERE a.dispatch_at<clock_timestamp()-interval '2 minutes' AND NOT EXISTS(SELECT 1 FROM email_result r WHERE r.attempt_id=a.id) ON CONFLICT DO NOTHING");
 return recovered.rowCount??0;
});}
async function claimEmail(){
 return transaction(async c=>{
  // Serialize only the short capacity/claim transaction, never the SMTP call.
  await c.query('SELECT pg_advisory_xact_lock(481029)');
  const a=(await c.query(`SELECT a.*,m.recipient_id,m.email,m.preference_version,m.source,m.notification_id,(m.created_at<clock_timestamp()-interval '7 days') expired FROM email_attempt a JOIN email_message m ON m.id=a.message_id WHERE a.dispatch_at IS NULL AND NOT EXISTS(SELECT 1 FROM email_result r WHERE r.attempt_id=a.id) AND (SELECT count(*) FROM email_attempt sent JOIN email_message sm ON sm.id=sent.message_id WHERE sm.recipient_id=m.recipient_id AND sent.dispatch_at>clock_timestamp()-interval '24 hours')<10 ORDER BY a.created_at,a.id FOR UPDATE OF a SKIP LOCKED LIMIT 1`)).rows[0];
  if(!a)return null;
  const recipient=(await c.query('SELECT id,email,role,suspended,is_test_fixture FROM app_actor WHERE id=$1 FOR SHARE',[a.recipient_id])).rows[0];
  const p=(await c.query('SELECT enabled,email,version FROM email_preference WHERE actor_id=$1 FOR SHARE',[a.recipient_id])).rows[0];
  let reason='';
  if(!recipient||recipient.suspended||recipient.is_test_fixture||!p?.enabled||p.email!==a.email||recipient.email.toLowerCase()!==a.email.toLowerCase()||p.version!==a.preference_version||!await notificationEmailPermitted(c,recipient,a.source,a.notification_id))reason='PERMISSION_CHANGED';
  else if(a.expired)reason='EXPIRED';
  if(reason){await c.query("INSERT INTO email_result(attempt_id,outcome,reason)VALUES($1,'CANCELLED',$2)",[a.id,reason]);return {cancelled:true as const};}
  const usage=(await c.query("SELECT count(*)::int total,coalesce(bool_or(dispatch_at>clock_timestamp()-interval '5 seconds'),false) recent FROM email_attempt WHERE dispatch_at>clock_timestamp()-interval '24 hours'")).rows[0];
  if(usage.total>=100||usage.recent)return null;
  await c.query('UPDATE email_attempt SET dispatch_at=clock_timestamp() WHERE id=$1',[a.id]);
  return {cancelled:false as const,id:a.id as string,email:a.email as string};
 });
}
export async function processEmailBatch(limit=5){
 if(process.env.EMAIL_SEND_ENABLED!=='true')return {accepted:0,rejected:0,unknown:0,cancelled:0,recovered:0,disabled:true};
 gmailSettings();inboxMail(process.env.APP_ORIGIN??'');
 const result={accepted:0,rejected:0,unknown:0,cancelled:0,recovered:await recoverInterruptedEmails(),disabled:false};
 for(let i=0;i<Math.max(1,Math.min(5,limit));i++){
  if(process.env.EMAIL_SEND_ENABLED!=='true')break;
  const claim=await claimEmail();if(!claim)break;if(claim.cancelled){result.cancelled++;continue;}
  const outcome=await sendInboxMail(claim.email,`<${claim.id}@rent2go.invalid>`);
  await transaction(async c=>{await c.query('INSERT INTO email_result(attempt_id,outcome,reason)VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[claim.id,outcome.outcome,outcome.reason]);});
  if(outcome.outcome==='ACCEPTED')result.accepted++;else if(outcome.outcome==='REJECTED')result.rejected++;else if(outcome.outcome==='CANCELLED')result.cancelled++;else result.unknown++;
 }
 return result;
}
