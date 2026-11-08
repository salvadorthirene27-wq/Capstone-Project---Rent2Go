import {afterAll,beforeAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {db} from '../../src/lib/db';
import {approvedAgency} from '../helpers/agency';
import {getBookingContacts,saveBookingContact,agencyFollowUps} from '../../src/modules/bookings/contacts';
import {getBookingRequest} from '../../src/modules/bookings/service';
import type {Actor} from '../../src/modules/partners/workflow';
const operator:Actor={id:randomUUID(),role:'RENTER'},staff:Actor={id:randomUUID(),role:'AGENCY_ADMIN'},renter:Actor={id:randomUUID(),role:'RENTER'},reviewer:Actor={id:randomUUID(),role:'SUPER_ADMIN'},foreign:Actor={id:randomUUID(),role:'RENTER'};
let agency:string,otherAgency:string;
beforeAll(async()=>{
 if(new URL(process.env.DATABASE_URL!).pathname!=='/rent2go_test'||process.env.NEON_PROJECT_ID!=='floral-flower-08375841')throw Error('Use isolated test database.');
 for(const a of [operator,staff,renter,reviewer,foreign])await db.query('INSERT INTO app_actor(id,email,name,role)VALUES($1,$2,$3,$4)',[a.id,a.id+'@example.test',a===staff?'Agency follow-up staff':'Contact workflow participant',a.role]);
 agency=await approvedAgency(operator,reviewer);otherAgency=await approvedAgency(foreign,reviewer);
 await db.query("INSERT INTO agency_member(agency_id,actor_id,role,created_by)VALUES($1,$2,'ADMIN',$3)",[agency,staff.id,operator.id]);
},60000);
afterAll(()=>db.end());
async function request(owner=renter,agencyId=agency){const id=randomUUID();await db.query("INSERT INTO booking_request(id,agency_id,renter_id,agency_name,status,contact)VALUES($1,$2,$3,'Agency contact fixture','REQUIREMENTS_PENDING',$4)",[id,agencyId,owner.id,{name:'Booking contact fixture',email:'private@example.test',phone:'09171234567',notes:''}]);return id;}
const plan=(extra:Record<string,unknown>={})=>({action:'ASSIGNMENT',version:1,idempotencyKey:randomUUID(),assigneeId:staff.id,nextFollowUpAt:new Date(Date.now()+86400000).toISOString(),note:'Independent agency staff will review this request.',...extra});
async function quotation(id:string){await db.query("INSERT INTO booking_quotation(id,request_id,revision,digest,issued_by,issued_at,expires_at,public_snapshot)VALUES($1,$2,1,$3,$4,clock_timestamp(),clock_timestamp()+interval '1 day','{}')",[randomUUID(),id,'a'.repeat(64),operator.id]);await db.query("UPDATE booking_request SET status='QUOTE_PENDING',version=version+1 WHERE id=$1",[id]);}
it('keeps assignment/contact history internal and leaves request status, version and notifications unchanged',async()=>{
 const id=await request(),before=(await db.query('SELECT status,version,contact FROM booking_request WHERE id=$1',[id])).rows[0];
 const n=Number((await db.query('SELECT count(*) n FROM booking_notification WHERE request_id=$1',[id])).rows[0].n);
 let result=await saveBookingContact(operator,id,plan());expect(result.version).toBe(2);expect(result.assignee).toMatchObject({id:staff.id,available:true});
 result=await saveBookingContact(staff,id,plan({action:'CONTACT',version:2,method:'EMAIL',outcome:'AWAITING_REPLY',contactedAt:new Date().toISOString(),note:'PRIVATE-CONTACT-NOTE used only by this isolated workflow.'}));
 expect(result.history[0]).toMatchObject({kind:'CONTACT',method:'EMAIL',outcome:'AWAITING_REPLY'});
 expect((await db.query('SELECT status,version,contact FROM booking_request WHERE id=$1',[id])).rows[0]).toEqual(before);
 expect(Number((await db.query('SELECT count(*) n FROM booking_notification WHERE request_id=$1',[id])).rows[0].n)).toBe(n);
 expect(JSON.stringify(await getBookingRequest(renter,id))).not.toContain('PRIVATE-CONTACT-NOTE');
 expect(JSON.stringify((await db.query('SELECT metadata FROM app_audit WHERE entity_id=$1',[id])).rows)).not.toContain('PRIVATE-CONTACT-NOTE');
 await expect(getBookingContacts(renter,id)).rejects.toMatchObject({status:403});
},60000);
it('rejects foreign agencies, unrelated platform admins and self-review, and only offers actual same-agency staff',async()=>{
 const id=await request(),own=await request(operator);
 const view=await getBookingContacts(operator,id);expect(view.staff.map(s=>s.id).sort()).toEqual([operator.id,staff.id].sort());
 for(const a of [foreign,reviewer]){await expect(getBookingContacts(a,id)).rejects.toMatchObject({status:404});await expect(saveBookingContact(a,id,plan())).rejects.toMatchObject({status:404});}
 await expect(saveBookingContact(operator,own,plan())).rejects.toMatchObject({status:403});
 await expect(saveBookingContact(operator,id,plan({assigneeId:foreign.id}))).rejects.toMatchObject({status:409});
 await expect(saveBookingContact(operator,id,plan({assigneeId:renter.id}))).rejects.toMatchObject({status:409});
 await expect(agencyFollowUps(foreign,agency)).rejects.toMatchObject({status:403});
},60000);
it('preserves one exact retry even after quote issuance and rejects reuse with different content',async()=>{
 const id=await request(),command=plan();await saveBookingContact(operator,id,command);await quotation(id);
 const duplicate=await saveBookingContact(operator,id,command);expect(duplicate.duplicate).toBe(true);expect(duplicate.total).toBe(1);expect(duplicate.editable).toBe(false);
 await expect(saveBookingContact(operator,id,{...command,note:'Changed content with the same key.'})).rejects.toMatchObject({status:409});
 await expect(saveBookingContact(operator,id,plan({version:2}))).rejects.toMatchObject({status:409});
 expect((await db.query('SELECT count(*)::int n FROM booking_contact_event WHERE request_id=$1',[id])).rows[0].n).toBe(1);
},60000);
it('serializes concurrent edits and rejects stale versions without appending a second event',async()=>{
 const id=await request(),results=await Promise.allSettled([saveBookingContact(operator,id,plan()),saveBookingContact(staff,id,plan())]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 const rejected=results.find(r=>r.status==='rejected') as PromiseRejectedResult;expect(rejected.reason.status).toBe(409);
 expect((await getBookingContacts(operator,id)).total).toBe(1);
},60000);
it('rechecks revoked or suspended assignees, allows unassignment and denies revoked readers',async()=>{
 const id=await request();await saveBookingContact(operator,id,plan());await db.query('UPDATE agency_member SET active=false WHERE agency_id=$1 AND actor_id=$2',[agency,staff.id]);
 try{expect((await getBookingContacts(operator,id)).assignee?.available).toBe(false);await expect(getBookingContacts(staff,id)).rejects.toMatchObject({status:404});await expect(saveBookingContact(operator,id,plan({version:2}))).rejects.toMatchObject({status:409});expect((await saveBookingContact(operator,id,plan({version:2,assigneeId:null}))).assignee).toBeNull();}
 finally{await db.query('UPDATE agency_member SET active=true WHERE agency_id=$1 AND actor_id=$2',[agency,staff.id]);}
 await db.query('UPDATE app_actor SET suspended=true WHERE id=$1',[staff.id]);try{await expect(saveBookingContact(operator,id,plan({version:3}))).rejects.toMatchObject({status:409});await expect(getBookingContacts(staff,id)).rejects.toMatchObject({status:403});}finally{await db.query('UPDATE app_actor SET suspended=false WHERE id=$1',[staff.id]);}
},60000);
it('freezes writes when a quotation wins the request lock, preserving saved terms',async()=>{
 const id=await request(),c=await db.connect();let saving:Promise<unknown>|undefined;
 try{await c.query('BEGIN');await c.query('SELECT id FROM booking_request WHERE id=$1 FOR UPDATE',[id]);
 saving=saveBookingContact(operator,id,plan()).catch(e=>e);
 await c.query("INSERT INTO booking_quotation(id,request_id,revision,digest,issued_by,issued_at,expires_at,public_snapshot)VALUES($1,$2,1,$3,$4,clock_timestamp(),clock_timestamp()+interval '1 day','{}')",[randomUUID(),id,'a'.repeat(64),operator.id]);await c.query("UPDATE booking_request SET status='QUOTE_PENDING' WHERE id=$1",[id]);await c.query('COMMIT');
 expect(await saving).toMatchObject({status:409});expect((await getBookingContacts(operator,id)).total).toBe(0);
 expect((await db.query('SELECT public_snapshot FROM booking_quotation WHERE request_id=$1',[id])).rows[0].public_snapshot).toEqual({});
 }finally{await c.query('ROLLBACK');c.release();}
},60000);
it('supports bounded history and tenant-specific due queues, including overdue plans',async()=>{
 const id=await request(),other=await request(renter,otherAgency);
 let version=1;for(let i=0;i<12;i++){const r=await saveBookingContact(operator,id,plan({version,note:'Scheduled follow-up revision '+i}));version=r.version;}
 const second=await getBookingContacts(operator,id,{page:2});expect(second.history).toHaveLength(2);expect(second.pageCount).toBe(2);
 await saveBookingContact(foreign,other,plan({assigneeId:foreign.id}));
 await db.query("UPDATE booking_contact_state SET next_follow_up_at=clock_timestamp()-interval '1 day' WHERE request_id=$1",[id]);
 const queue=await agencyFollowUps(operator,agency);expect(queue.items.find(r=>r.id===id)?.overdue).toBe(true);expect(queue.items.some(r=>r.id===other)).toBe(false);
 await quotation(id);expect((await agencyFollowUps(operator,agency)).items.some(r=>r.id===id)).toBe(false);
},90000);
it('rejects impossible times, keeps history immutable and supports restricted-runtime reads and saves',async()=>{
 const id=await request();await expect(saveBookingContact(operator,id,plan({nextFollowUpAt:'2000-01-01T00:00:00Z'}))).rejects.toMatchObject({status:422});
 await expect(saveBookingContact(operator,id,plan({action:'CONTACT',method:'PHONE',outcome:'REACHED',contactedAt:'2099-01-01T00:00:00Z'}))).rejects.toMatchObject({status:422});
 await saveBookingContact(operator,id,plan());
 const runtime=new Pool({connectionString:process.env.TEST_RUNTIME_DATABASE_URL});try{
 expect((await runtime.query('SELECT count(*)::int n FROM booking_contact_event WHERE request_id=$1',[id])).rows[0].n).toBe(1);
 await expect(runtime.query("UPDATE booking_contact_event SET note='Changed' WHERE request_id=$1",[id])).rejects.toMatchObject({code:'42501'});
 await expect(db.query("UPDATE booking_contact_event SET note='Changed' WHERE request_id=$1",[id])).rejects.toThrow(/immutable/);
 await runtime.query('UPDATE booking_contact_state SET next_follow_up_at=NULL WHERE request_id=$1',[id]);
 }finally{await runtime.end();}
},60000);
