import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {db} from '../../src/lib/db';
import {approvedAgency} from '../helpers/agency';
import type {Actor} from '../../src/modules/partners/workflow';
import {getInbox,markNotificationsRead,notificationEmailPermitted} from '../../src/modules/notifications/service';
import {getEmailSettings,changeEmailSettings} from '../../src/modules/email/service';
const owner:Actor={id:randomUUID(),role:'RENTER'},member:Actor={id:randomUUID(),role:'RENTER'},admin:Actor={id:randomUUID(),role:'SUPER_ADMIN'};
let agency:string,account:string,notification:string;
const identity={id:member.id,email:`${member.id}@example.test`,emailVerified:true};
beforeAll(async()=>{
 for(const u of [owner,member,admin])await db.query("INSERT INTO app_actor(id,email,name,role)VALUES($1,$2,'Synthetic notification participant',$3)",[u.id,`${u.id}@example.test`,u.role]);
 agency=await approvedAgency(owner,admin);await db.query("INSERT INTO agency_member(agency_id,actor_id,role)VALUES($1,$2,'ADMIN')",[agency,member.id]);account=randomUUID();await db.query("INSERT INTO platform_account(id,agency_id,environment)VALUES($1,$2,'DEMO')",[account,agency]);
 const settings=await getEmailSettings(member,identity);await changeEmailSettings(member,identity,{action:'PREFERENCE',version:settings.version,enabled:true,acknowledgement:true});
 notification=randomUUID();await db.query("INSERT INTO remittance_notification(id,account_id,recipient_id,message)VALUES($1,$2,$3,'Private remittance event only in the protected inbox')",[notification,account,member.id]);
},120000);
afterAll(async()=>{await db.query('UPDATE email_preference SET enabled=false,version=version+1,updated_at=clock_timestamp() WHERE actor_id=$1',[member.id]);await db.end();});
it('queues only a protected inbox notification, preserves read receipts and honors exact remittance source identity',async()=>{
 const inbox=await getInbox(member,{category:'REMITTANCE'});expect(inbox.total).toBe(1);expect(inbox.items[0].link).toBe(`/agency/${agency}/remittances?environment=DEMO`);
 const queued=(await db.query("SELECT source,notification_id,recipient_id FROM email_message WHERE notification_id=$1",[notification])).rows;expect(queued).toEqual([{source:'REMITTANCE',notification_id:notification,recipient_id:member.id}]);
 await markNotificationsRead(member,{items:[{source:'REMITTANCE',id:notification}]});expect((await getInbox(member,{category:'REMITTANCE'})).items[0].readAt).not.toBeNull();
 const c=await db.connect();try{expect(await notificationEmailPermitted(c,member,'REMITTANCE',notification)).toBe(true);expect(await notificationEmailPermitted(c,owner,'REMITTANCE',notification)).toBe(false);}finally{c.release();}
});
it('redacts retained updates and denies queued-email source access as soon as membership is removed',async()=>{
 await db.query('UPDATE agency_member SET active=false WHERE agency_id=$1 AND actor_id=$2',[agency,member.id]);const inbox=await getInbox(member,{category:'REMITTANCE'});expect(inbox.items[0].link).toBeNull();expect(inbox.items[0].message).not.toContain('Private remittance');expect(inbox.items[0].readAt).not.toBeNull();
 const c=await db.connect();try{expect(await notificationEmailPermitted(c,member,'REMITTANCE',notification)).toBe(false);}finally{c.release();}
});
