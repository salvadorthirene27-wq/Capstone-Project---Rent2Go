import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {transaction} from '../../lib/db';
import {uuid} from '../../lib/http';
import {digest} from '../cart/pricing';
import {audit,storedActor} from '../partners/service';
import {agencyOperatingContext} from '../agencies/service';
import {DomainError,type Actor} from '../partners/workflow';
import {financialContext,type FinancialContext} from './finance-context';
import {lockBookingAuthority} from './quotation';
import {cancellationPending} from './cancellation-guard';
import {contactCommand,contactPage} from './contact-schema';
const stages=['REQUIREMENTS_PENDING','CHANGES_REQUESTED','UNDER_REVIEW','READY_FOR_APPROVAL'];
async function context(c:PoolClient,actor:Actor,id:string,write=false){
 await c.query(`SELECT id FROM booking_request WHERE id=$1 FOR ${write?'UPDATE':'SHARE'}`,[uuid.parse(id)]);
 const ctx=await financialContext(c,actor,id);
 if(!ctx.operator)throw new DomainError('Independent agency access is required for contact records.',403);
 await lockBookingAuthority(c,ctx,[],true);
 return ctx;
}
async function reason(c:PoolClient,ctx:FinancialContext){
 if(!stages.includes(ctx.r.status)||(await c.query('SELECT 1 FROM booking_quotation WHERE request_id=$1 LIMIT 1',[ctx.r.id])).rowCount)return 'The contact log is read-only after quotation issuance or request closure.';
 if(await cancellationPending(c,ctx.r.id))return 'Resolve the pending cancellation before updating contact records.';
 return null;
}
async function state(c:PoolClient,id:string){return(await c.query('SELECT s.*,a.name AS assigned_name FROM booking_contact_state s LEFT JOIN app_actor a ON a.id=s.assigned_actor_id WHERE s.request_id=$1',[id])).rows[0];}
async function staff(c:PoolClient,ctx:FinancialContext){return(await c.query<{id:string;name:string}>(`SELECT a.id,a.name FROM app_actor a JOIN agency g ON g.id=$1 WHERE NOT a.suspended AND NOT a.is_test_fixture AND a.id<>$2 AND (g.owner_id=a.id OR EXISTS(SELECT 1 FROM agency_member m WHERE m.agency_id=g.id AND m.actor_id=a.id AND m.active)) ORDER BY lower(a.name),a.id`,[ctx.r.agency_id,ctx.r.renter_id])).rows;}
async function projection(c:PoolClient,ctx:FinancialContext,page:number){
 const current=await state(c,ctx.r.id),members=await staff(c,ctx),blockedReason=await reason(c,ctx);
 const total=Number((await c.query('SELECT count(*) n FROM booking_contact_event WHERE request_id=$1',[ctx.r.id])).rows[0].n);
 const rows=(await c.query('SELECT id,version,kind,actor_name,assigned_name,method,outcome,contacted_at,note,next_follow_up_at,recorded_at FROM booking_contact_event WHERE request_id=$1 ORDER BY version DESC LIMIT 10 OFFSET $2',[ctx.r.id,(page-1)*10])).rows;
 const stamp=(v:Date|null|undefined)=>v?.toISOString()??null;
 return {requestId:ctx.r.id,version:current?.version??1,editable:blockedReason===null,blockedReason,serverNow:stamp((await c.query('SELECT clock_timestamp() n')).rows[0].n)!,
  assignee:current?.assigned_actor_id?{id:current.assigned_actor_id as string,name:current.assigned_name as string,available:members.some(m=>m.id===current.assigned_actor_id)}:null,
  nextFollowUpAt:stamp(current?.next_follow_up_at),staff:members,total,page,pageCount:Math.max(1,Math.ceil(total/10)),
  history:rows.map(r=>({id:r.id as string,version:r.version as number,kind:r.kind as 'ASSIGNMENT'|'CONTACT',actorName:r.actor_name as string,assignedName:r.assigned_name as string|null,method:r.method as 'PHONE'|'EMAIL'|null,outcome:r.outcome as 'REACHED'|'NO_ANSWER'|'AWAITING_REPLY'|'NOT_PROCEEDING'|null,contactedAt:stamp(r.contacted_at),note:r.note as string,nextFollowUpAt:stamp(r.next_follow_up_at),recordedAt:stamp(r.recorded_at)!}))};
}
export async function getBookingContacts(actor:Actor,id:string,input:unknown={}){
 const {page}=contactPage.parse(input);return transaction(async c=>projection(c,await context(c,actor,id),page));
}
export async function saveBookingContact(actor:Actor,id:string,input:unknown){
 const command=contactCommand.parse(input),hash=digest(command);
 return transaction(async c=>{
  const ctx=await context(c,actor,id,true);
  const old=(await c.query('SELECT id,digest FROM booking_contact_command WHERE request_id=$1 AND actor_id=$2 AND idempotency_key=$3',[id,ctx.user.id,command.idempotencyKey])).rows[0];
  if(old){if(old.digest!==hash)throw new DomainError('This save key was already used for different contact details.',409);return {...await projection(c,ctx,1),duplicate:true};}
  const blocked=await reason(c,ctx);if(blocked)throw new DomainError(blocked,409);
  const current=await state(c,id);
  if((current?.version??1)!==command.version)throw new DomainError('The contact log changed. Reload it before saving.',409);
  let assignedName:string|null=null;
  if(command.assigneeId){
   // Include the assignee in the same ordered actor lock set used by quotations.
   try{await lockBookingAuthority(c,ctx,[command.assigneeId],true);}catch(e){if(e instanceof DomainError&&e.status===409)throw new DomainError('The selected staff member is no longer available.',409);throw e;}
   const member=(await c.query('SELECT active FROM agency_member WHERE agency_id=$1 AND actor_id=$2 FOR SHARE',[ctx.r.agency_id,command.assigneeId])).rows[0];
   const owner=(await c.query('SELECT owner_id FROM agency WHERE id=$1',[ctx.r.agency_id])).rows[0];
   const selected=(await staff(c,ctx)).find(m=>m.id===command.assigneeId);
   if(!selected||(!(member?.active)&&owner.owner_id!==command.assigneeId))throw new DomainError('Select an active staff member from this agency.',409);
   assignedName=selected.name;
  }
  const now=(await c.query('SELECT clock_timestamp() n')).rows[0].n as Date;
  if(command.nextFollowUpAt&&Date.parse(command.nextFollowUpAt)<=now.getTime()&&command.nextFollowUpAt!==current?.next_follow_up_at?.toISOString())throw new DomainError('Choose a future follow-up time in Manila.',422);
  if(command.action==='CONTACT'&&Date.parse(command.contactedAt)>now.getTime()+120000)throw new DomainError('A contact attempt cannot be recorded in the future.',422);
  const commandId=randomUUID(),version=command.version+1;
  await c.query('INSERT INTO booking_contact_command(id,request_id,actor_id,idempotency_key,digest)VALUES($1,$2,$3,$4,$5)',[commandId,id,ctx.user.id,command.idempotencyKey,hash]);
  await c.query('INSERT INTO booking_contact_state(request_id,version,assigned_actor_id,next_follow_up_at)VALUES($1,$2,$3,$4) ON CONFLICT(request_id) DO UPDATE SET version=excluded.version,assigned_actor_id=excluded.assigned_actor_id,next_follow_up_at=excluded.next_follow_up_at,updated_at=clock_timestamp()',[id,version,command.assigneeId,command.nextFollowUpAt]);
  await c.query('INSERT INTO booking_contact_event(id,request_id,command_id,version,kind,actor_id,actor_name,assigned_actor_id,assigned_name,method,outcome,contacted_at,note,next_follow_up_at)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[randomUUID(),id,commandId,version,command.action,ctx.user.id,ctx.user.name??'Agency staff',command.assigneeId,assignedName,command.action==='CONTACT'?command.method:null,command.action==='CONTACT'?command.outcome:null,command.action==='CONTACT'?command.contactedAt:null,command.note,command.nextFollowUpAt]);
  await audit(c,ctx.user,'BOOKING_CONTACT_RECORDED',id,{kind:command.action,version});
  return {...await projection(c,ctx,1),duplicate:false};
 });
}
export async function agencyFollowUps(actor:Actor,agencyId:string,input:unknown={}){
 const {page}=contactPage.parse(input);uuid.parse(agencyId);
 return transaction(async c=>{
  const user=await storedActor(actor,c),authority=await agencyOperatingContext(c,user,agencyId);
  if(!authority.operatesAgency||(await c.query('SELECT is_test_fixture FROM app_actor WHERE id=$1',[user.id])).rows[0]?.is_test_fixture)throw new DomainError('Active agency access is required.',403);
  const filter=`r.agency_id=$1 AND r.renter_id<>$2 AND s.next_follow_up_at IS NOT NULL AND r.status=ANY($3::text[]) AND NOT EXISTS(SELECT 1 FROM booking_quotation q WHERE q.request_id=r.id) AND NOT EXISTS(SELECT 1 FROM booking_cancellation_request x WHERE x.request_id=r.id AND NOT EXISTS(SELECT 1 FROM booking_cancellation_decision d WHERE d.cancellation_id=x.id))`;
  const total=Number((await c.query(`SELECT count(*) n FROM booking_contact_state s JOIN booking_request r ON r.id=s.request_id WHERE ${filter}`,[agencyId,user.id,stages])).rows[0].n);
  const rows=(await c.query(`SELECT r.id,r.contact->>'name' renter_name,a.name assigned_name,s.next_follow_up_at,s.next_follow_up_at<=clock_timestamp() overdue FROM booking_contact_state s JOIN booking_request r ON r.id=s.request_id LEFT JOIN app_actor a ON a.id=s.assigned_actor_id WHERE ${filter} ORDER BY s.next_follow_up_at,r.id LIMIT 10 OFFSET $4`,[agencyId,user.id,stages,(page-1)*10])).rows;
  return {total,page,pageCount:Math.max(1,Math.ceil(total/10)),items:rows.map(r=>({id:r.id as string,renterName:r.renter_name as string,assignedName:r.assigned_name as string|null,nextFollowUpAt:(r.next_follow_up_at as Date).toISOString(),overdue:r.overdue as boolean}))};
 });
}
export type BookingContactLog=Awaited<ReturnType<typeof getBookingContacts>>;
