import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {db} from '../../src/lib/db';
import {approvedAgency} from '../helpers/agency';
import {getBookingContacts,saveBookingContact,agencyFollowUps} from '../../src/modules/bookings/contacts';
const operator={id:randomUUID(),role:'RENTER' as const},renter={id:randomUUID(),role:'RENTER' as const},admin={id:randomUUID(),role:'SUPER_ADMIN' as const};let agency:string;
beforeAll(async()=>{
 if(new URL(process.env.DATABASE_URL!).pathname!=='/rent2go_test')throw Error('Use isolated database.');
 for(const a of [operator,renter,admin])await db.query("INSERT INTO app_actor(id,email,name,role)VALUES($1,$2,'Contact guard participant',$3)",[a.id,a.id+'@example.test',a.role]);agency=await approvedAgency(operator,admin);
},60000);afterAll(()=>db.end());
async function fixture(){const id=randomUUID();await db.query("INSERT INTO booking_request(id,agency_id,renter_id,agency_name,contact)VALUES($1,$2,$3,'Guard fixture',$4)",[id,agency,renter.id,{name:'Contact guard guest',email:'private@example.test',phone:'09171234567',notes:''}]);return id;}
const plan=(version=1)=>({action:'ASSIGNMENT',version,idempotencyKey:randomUUID(),assigneeId:operator.id,nextFollowUpAt:new Date(Date.now()+86400000).toISOString(),note:'Arrange the independent document review.'});
it('performs complete runtime-role saves, reads and queue queries without widening history privileges',async()=>{
 const id=await fixture(),runtime=new Pool({connectionString:process.env.TEST_RUNTIME_DATABASE_URL,max:1}),connect=vi.spyOn(db,'connect').mockImplementation((()=>runtime.connect()) as typeof db.connect);
 try{expect((await saveBookingContact(operator,id,plan())).version).toBe(2);expect((await getBookingContacts(operator,id)).history).toHaveLength(1);expect((await agencyFollowUps(operator,agency)).items.some(r=>r.id===id)).toBe(true);await expect(runtime.query('DELETE FROM booking_contact_command WHERE request_id=$1',[id])).rejects.toMatchObject({code:'42501'});}finally{connect.mockRestore();await runtime.end();}
},60000);
it('pauses edits and scheduling during cancellation review without deleting existing history',async()=>{
 const id=await fixture();await saveBookingContact(operator,id,plan());await db.query("INSERT INTO booking_cancellation_request(id,request_id,actor_id,reason,body,digest)VALUES($1,$2,$3,'Pending independent review','{}',$4)",[randomUUID(),id,renter.id,'a'.repeat(64)]);
 const view=await getBookingContacts(operator,id);expect(view.editable).toBe(false);expect(view.history).toHaveLength(1);await expect(saveBookingContact(operator,id,plan(2))).rejects.toMatchObject({status:409});expect((await agencyFollowUps(operator,agency)).items.some(r=>r.id===id)).toBe(false);
},60000);
it('denies inactive agencies and suspended/fixture staff, then retains the original history on restoration',async()=>{
 const id=await fixture();await saveBookingContact(operator,id,plan());await db.query('UPDATE agency SET active=false WHERE id=$1',[agency]);
 try{await expect(getBookingContacts(operator,id)).rejects.toMatchObject({status:404});await expect(saveBookingContact(operator,id,plan(2))).rejects.toMatchObject({status:404});}finally{await db.query('UPDATE agency SET active=true WHERE id=$1',[agency]);}
 await db.query('UPDATE app_actor SET is_test_fixture=true WHERE id=$1',[operator.id]);try{await expect(getBookingContacts(operator,id)).rejects.toMatchObject({status:403});}finally{await db.query('UPDATE app_actor SET is_test_fixture=false WHERE id=$1',[operator.id]);}
 expect((await getBookingContacts(operator,id)).total).toBe(1);
},60000);
