import type {PoolClient} from 'pg';
import {createHash,randomUUID} from 'node:crypto';
import {transaction} from '../../lib/db';
import {storedActor} from '../partners/service';
import {DomainError,type Actor} from '../partners/workflow';
import {inboxQuery,readNotifications,notificationAction,type NotificationSource} from './schema';

async function userContext(c:PoolClient,actor:Actor,lock=false){
 if(lock)await c.query('SELECT id FROM app_actor WHERE id=$1 FOR UPDATE',[actor.id]);
 const user=await storedActor(actor,c);if((await c.query('SELECT is_test_fixture FROM app_actor WHERE id=$1',[user.id])).rows[0]?.is_test_fixture)throw new DomainError('Inbox access denied.',403);return user;
}
const operate=(agency:string)=>`EXISTS(SELECT 1 FROM agency g JOIN app_actor own ON own.id=g.owner_id WHERE g.id=${agency} AND g.active AND NOT own.suspended AND NOT own.is_test_fixture AND (g.owner_id=$1 OR EXISTS(SELECT 1 FROM agency_member m WHERE m.agency_id=g.id AND m.actor_id=$1 AND m.active)))`;
// Every branch first restricts the delivered recipient. Source access is resolved
// separately, so a former member gets no saved reason or private target identifier.
const delivered=`
 SELECT 'PARTNER'::text source,n.id,n.message,n.created_at,n.read_at legacy_read_at,(a.owner_id=$1 OR $2::text='SUPER_ADMIN') permitted,
 CASE WHEN a.owner_id=$1 THEN '/workspace/application' ELSE '/admin/applications/'||a.id END target
 FROM app_notification n JOIN partner_application a ON a.id=n.application_id WHERE n.recipient_id=$1
 UNION ALL
 SELECT 'BOOKING',n.id,n.message,n.created_at,n.read_at,(r.renter_id=$1 OR ${operate('r.agency_id')}),
 CASE WHEN r.renter_id=$1 THEN '/workspace/bookings/'||r.id ELSE '/agency/'||r.agency_id||'/bookings/'||r.id END
 FROM booking_notification n JOIN booking_request r ON r.id=n.request_id WHERE n.recipient_id=$1
 UNION ALL
 SELECT 'FINANCE',n.id,CASE WHEN a.environment='DEMO' THEN 'Simulated financial records · no money moves. '||n.message ELSE n.message END,n.created_at,n.read_at,(a.owner_id=$1 OR ${operate('a.agency_id')}),
 CASE WHEN a.owner_id=$1 THEN '/workspace/earnings/'||a.agency_id||'?environment='||a.environment ELSE '/agency/'||a.agency_id||'/accounting/'||a.owner_id||'?environment='||a.environment END
 FROM finance_notification n JOIN owner_account a ON a.id=n.account_id WHERE n.recipient_id=$1
 UNION ALL
 SELECT 'VEHICLE',n.id,n.message,n.created_at,NULL::timestamptz,(v.owner_actor_id=$1 OR (o.revision>0 AND ${operate('o.agency_id')}) OR $2::text='SUPER_ADMIN'),
 CASE WHEN v.owner_actor_id=$1 THEN '/workspace/vehicles/'||o.id WHEN ${operate('o.agency_id')} THEN '/agency/'||o.agency_id||'/vehicles' ELSE '/admin/vehicles' END
 FROM vehicle_notification n JOIN vehicle_offer o ON o.id=n.offer_id JOIN physical_vehicle v ON v.id=o.vehicle_id WHERE n.recipient_id=$1
 UNION ALL
 SELECT 'REMITTANCE',n.id,CASE WHEN a.environment='DEMO' THEN 'Simulated remittance records · no money moves. '||n.message ELSE n.message END,n.created_at,NULL::timestamptz,(platform_agency_operator($1,a.id) OR platform_independent_reviewer($1,a.id)),
 CASE WHEN platform_agency_operator($1,a.id) THEN '/agency/'||a.agency_id||'/remittances?environment='||a.environment ELSE '/admin/remittances/'||a.agency_id||'?environment='||a.environment END
 FROM remittance_notification n JOIN platform_account a ON a.id=n.account_id WHERE n.recipient_id=$1
 UNION ALL
 SELECT 'GOVERNANCE',n.id,n.message,n.created_at,NULL::timestamptz,(p.actor_id=$1 OR e.subject_id=$1 OR $2::text='SUPER_ADMIN'),
 CASE WHEN p.actor_id=$1 THEN '/account-status/privacy/'||p.id WHEN p.id IS NOT NULL THEN '/admin/privacy/'||p.id WHEN e.subject_id=$1 THEN '/account-status?view=ALL' ELSE '/admin/users/'||e.subject_id END
 FROM governance_notification n LEFT JOIN privacy_case p ON p.id=n.case_id LEFT JOIN account_governance_event e ON e.id=n.account_event_id WHERE n.recipient_id=$1`;
const source=`WITH delivered AS(${delivered}),inbox AS(SELECT n.*,COALESCE(r.read_at,n.legacy_read_at) read_at,v.hidden_at,v.batch_id FROM delivered n LEFT JOIN notification_read_receipt r ON r.source=n.source AND r.notification_id=n.id AND r.recipient_id=$1 LEFT JOIN notification_visibility v ON v.source=n.source AND v.notification_id=n.id AND v.recipient_id=$1)`;

export async function notificationEmailPermitted(c:PoolClient,user:Actor,kind:string,id:string){return Boolean((await c.query(`WITH delivered AS(${delivered}) SELECT permitted FROM delivered WHERE source=$3 AND id=$4`,[user.id,user.role,kind,id])).rows[0]?.permitted);}
type Query=ReturnType<typeof inboxQuery.parse>;
async function projection(c:PoolClient,user:Actor,q:Query){
 const params=[user.id,user.role,q.status,q.category],where="(($3::text='DELETED' AND hidden_at IS NOT NULL) OR ($3::text<>'DELETED' AND hidden_at IS NULL AND ($3::text='ALL' OR read_at IS NULL))) AND ($4::text='ALL' OR source=$4)",totals=(await c.query(`${source} SELECT count(*) FILTER(WHERE read_at IS NULL AND hidden_at IS NULL)::int unread,count(*) FILTER(WHERE ${where})::int total FROM inbox`,params)).rows[0];
 const pageCount=Math.max(1,Math.ceil(totals.total/20)),page=Math.min(q.page,pageCount),rows=(await c.query(`${source} SELECT source,id,CASE WHEN permitted THEN message ELSE 'Source access changed. This saved update is retained; private details are unavailable.' END message,created_at,read_at,CASE WHEN permitted THEN target ELSE NULL END link FROM inbox WHERE ${where} ORDER BY created_at DESC,id DESC,source LIMIT 20 OFFSET $5`,[...params,(page-1)*20])).rows;
 return {filters:{...q,page},unread:totals.unread as number,total:totals.total as number,pageCount,preparedAt:(await c.query('SELECT clock_timestamp() stamp')).rows[0].stamp.toISOString() as string,items:rows.map(r=>({source:r.source as NotificationSource,id:r.id as string,message:r.message as string,createdAt:(r.created_at as Date).toISOString(),readAt:r.read_at?(r.read_at as Date).toISOString():null,link:r.link as string|null}))};
}
export type NotificationInbox=Awaited<ReturnType<typeof projection>>;
export async function getUnreadNotificationCount(actor:Actor){return transaction(async c=>{
 await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const user=await userContext(c,actor);
 const row=(await c.query(`${source} SELECT count(*) FILTER(WHERE read_at IS NULL AND hidden_at IS NULL)::int unread,clock_timestamp() prepared_at FROM inbox`,[user.id,user.role])).rows[0];
 return {actorId:user.id,unread:row.unread as number,preparedAt:(row.prepared_at as Date).toISOString()};
});}
export async function getInbox(actor:Actor,input:unknown={}){const q=inboxQuery.parse(input);return transaction(async c=>{await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');return projection(c,await userContext(c,actor),q);});}
export async function markNotificationsRead(actor:Actor,input:unknown){
 const command=readNotifications.parse(input);
 return transaction(async c=>{const user=await userContext(c,actor,true),params=[user.id,user.role,JSON.stringify(command.items)],found=(await c.query(`${source} SELECT i.source,i.id FROM inbox i JOIN jsonb_to_recordset($3::jsonb) requested(source text,id uuid) ON requested.source=i.source AND requested.id=i.id WHERE i.hidden_at IS NULL`,params)).rows;
  if(found.length!==command.items.length)throw new DomainError('One or more updates are unavailable in your inbox. Refresh before continuing.',404);
  await c.query(`${source} INSERT INTO notification_read_receipt(source,notification_id,recipient_id,read_at)SELECT i.source,i.id,$1,COALESCE(i.read_at,clock_timestamp()) FROM inbox i JOIN jsonb_to_recordset($3::jsonb) requested(source text,id uuid) ON requested.source=i.source AND requested.id=i.id WHERE i.hidden_at IS NULL ON CONFLICT(source,notification_id) DO NOTHING`,params);
  return projection(c,user,command.query);
 });
}

// Same-recipient commands serialize with reads and deactivation; a retry replays the
// original targets rather than accidentally deleting notifications delivered later.
export async function changeNotifications(actor:Actor,input:unknown){
 const command=notificationAction.parse(input),{query:filters,idempotencyKey,...intent}=command;
 const digest=createHash('sha256').update(JSON.stringify(intent)).digest('hex');
 return transaction(async c=>{
  const user=await userContext(c,actor,true),old=(await c.query('SELECT * FROM notification_action WHERE recipient_id=$1 AND idempotency_key=$2',[user.id,idempotencyKey])).rows[0];
  if(old){if(old.digest!==digest)throw new DomainError('This notification action key was already used for a different request.',409);return {inbox:await projection(c,user,filters),affected:old.affected as number,undoId:['DELETE_ONE','DELETE_READ'].includes(old.action)?old.id as string:null};}
  let where:string,extra:unknown[]=[];
  if(command.action==='MARK_ALL_READ')where='hidden_at IS NULL AND read_at IS NULL';
  else if(command.action==='DELETE_READ')where='hidden_at IS NULL AND read_at IS NOT NULL';
  else if(command.action==='RESTORE_BATCH'){
   const batch=(await c.query("SELECT 1 FROM notification_action WHERE id=$1 AND recipient_id=$2 AND action IN ('DELETE_ONE','DELETE_READ')",[command.batchId,user.id])).rowCount;
   if(!batch)throw new DomainError('Deleted notification batch not found.',404);
   where='hidden_at IS NOT NULL AND batch_id=$3';extra=[command.batchId];
  }else{where=`source=$3 AND id=$4 AND hidden_at IS ${command.action==='DELETE_ONE'?'NULL':'NOT NULL'}`;extra=[command.item.source,command.item.id];}
  const targets=(await c.query(`${source} SELECT source,id FROM inbox WHERE ${where} ORDER BY source,id`,[user.id,user.role,...extra])).rows as {source:NotificationSource;id:string}[];
  if((command.action==='DELETE_ONE'||command.action==='RESTORE_ONE')&&targets.length!==1)throw new DomainError('This update is unavailable in the selected inbox. Refresh before continuing.',404);
  const id=randomUUID(),encoded=JSON.stringify(targets);
  await c.query('INSERT INTO notification_action(id,recipient_id,idempotency_key,digest,action,targets,affected)VALUES($1,$2,$3,$4,$5,$6,$7)',[id,user.id,idempotencyKey,digest,command.action,encoded,targets.length]);
  if(command.action==='MARK_ALL_READ')await c.query("INSERT INTO notification_read_receipt(source,notification_id,recipient_id)SELECT source,id,$1 FROM jsonb_to_recordset($2::jsonb) t(source text,id uuid) ON CONFLICT(source,notification_id) DO NOTHING",[user.id,encoded]);
  else if(command.action==='DELETE_ONE'||command.action==='DELETE_READ')await c.query("INSERT INTO notification_visibility(source,notification_id,recipient_id,hidden_at,batch_id)SELECT source,id,$1,clock_timestamp(),$3 FROM jsonb_to_recordset($2::jsonb) t(source text,id uuid) ON CONFLICT(source,notification_id) DO UPDATE SET hidden_at=EXCLUDED.hidden_at,batch_id=EXCLUDED.batch_id",[user.id,encoded,id]);
  else await c.query('UPDATE notification_visibility v SET hidden_at=NULL,batch_id=NULL FROM jsonb_to_recordset($2::jsonb) t(source text,id uuid) WHERE v.source=t.source AND v.notification_id=t.id AND v.recipient_id=$1',[user.id,encoded]);
  return {inbox:await projection(c,user,filters),affected:targets.length,undoId:command.action==='DELETE_ONE'||command.action==='DELETE_READ'?id:null};
 });
}
