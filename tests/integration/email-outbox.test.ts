import {afterAll,afterEach,beforeAll,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {db} from '../../src/lib/db';
import {createApplication} from '../../src/modules/partners/service';
import {changeEmailSettings,getEmailSettings,processEmailBatch,recoverInterruptedEmails,type EmailIdentity} from '../../src/modules/email/service';
import * as provider from '../../src/modules/email/provider';
import type {Actor} from '../../src/modules/partners/workflow';
const user:Actor={id:randomUUID(),role:'RENTER'},foreign:Actor={id:randomUUID(),role:'RENTER'};
const identity:EmailIdentity={id:user.id,email:`${user.id}@example.test`,emailVerified:true};
let application:string;
beforeAll(async()=>{if(new URL(process.env.DATABASE_URL!).pathname!=='/rent2go_test')throw Error('Isolated test database required');for(const a of[user,foreign])await db.query("INSERT INTO app_actor(id,email,name)VALUES($1,$2,'Synthetic mail recipient')",[a.id,`${a.id}@example.test`]);application=(await createApplication(user)).id;},60000);
afterAll(async()=>{await db.query('UPDATE email_preference SET enabled=false,version=version+1,updated_at=clock_timestamp() WHERE actor_id=$1',[user.id]);await retirePending();await db.end();});afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
async function retirePending(){await db.query("INSERT INTO email_result(attempt_id,outcome,reason)SELECT a.id,'CANCELLED','PERMISSION_CHANGED' FROM email_attempt a JOIN email_message m ON m.id=a.message_id WHERE m.recipient_id=$1 AND a.dispatch_at IS NULL AND NOT EXISTS(SELECT 1 FROM email_result r WHERE r.attempt_id=a.id) ON CONFLICT DO NOTHING",[user.id]);}
async function preference(enabled:boolean){const p=await getEmailSettings(user,identity);return changeEmailSettings(user,identity,{action:'PREFERENCE',version:p.version,enabled,acknowledgement:true});}
async function update(){const id=randomUUID();await db.query("INSERT INTO app_notification(id,recipient_id,application_id,message)VALUES($1,$2,$3,'PRIVATE booking/financial detail not for email')",[id,user.id,application]);return (await db.query('SELECT id FROM email_message WHERE notification_id=$1',[id])).rows[0]?.id as string|undefined;}
async function outcome(message:string,kind:'REJECTED'|'UNKNOWN'|'ACCEPTED'){
 const a=(await db.query('SELECT id FROM email_attempt WHERE message_id=$1 ORDER BY ordinal DESC LIMIT 1',[message])).rows[0];await db.query('UPDATE email_attempt SET dispatch_at=clock_timestamp() WHERE id=$1',[a.id]);await db.query('INSERT INTO email_result(attempt_id,outcome,reason)VALUES($1,$2,$3)',[a.id,kind,kind==='REJECTED'?'SMTP_REJECTED':kind==='UNKNOWN'?'OUTCOME_UNCONFIRMED':'SMTP_ACCEPTED']);return a.id;
}
it('defaults off, requires verified identity and optimistic versions, queues only future events atomically',async()=>{
 expect((await getEmailSettings(user,identity)).enabled).toBe(false);expect(await update()).toBeUndefined();
 await expect(changeEmailSettings(user,{...identity,emailVerified:false},{action:'PREFERENCE',version:0,enabled:true,acknowledgement:true})).rejects.toMatchObject({status:409});await preference(true);
 await expect(changeEmailSettings(user,identity,{action:'PREFERENCE',version:0,enabled:false,acknowledgement:true})).rejects.toMatchObject({status:409});const id=await update();expect(id).toBeTruthy();
 const c=await db.connect(),notification=randomUUID();try{await c.query('BEGIN');await c.query("INSERT INTO app_notification(id,recipient_id,application_id,message)VALUES($1,$2,$3,'Rolled back')",[notification,user.id,application]);expect((await c.query('SELECT id FROM email_message WHERE notification_id=$1',[notification])).rowCount).toBe(1);await c.query('ROLLBACK');expect((await db.query('SELECT id FROM email_message WHERE notification_id=$1',[notification])).rowCount).toBe(0);}finally{c.release();}
 expect(JSON.stringify((await getEmailSettings(user,identity)).items)).not.toContain('PRIVATE');
});
it('keeps recipient history private, rejects foreign retries and records exact retry keys once',async()=>{
 const m=(await update())!;await outcome(m,'REJECTED');const command={action:'RETRY',messageId:m,requestKey:randomUUID(),acknowledgement:true};
 await expect(changeEmailSettings(foreign,{id:foreign.id,email:`${foreign.id}@example.test`,emailVerified:true},command)).rejects.toMatchObject({status:404});
 await changeEmailSettings(user,identity,command);await changeEmailSettings(user,identity,command);expect((await db.query('SELECT count(*)::int n FROM email_attempt WHERE message_id=$1',[m])).rows[0].n).toBe(2);
 await expect(changeEmailSettings(user,identity,{...command,requestKey:randomUUID()})).rejects.toMatchObject({status:409});expect((await getEmailSettings(foreign,{id:foreign.id,email:`${foreign.id}@example.test`,emailVerified:true})).total).toBe(0);
 await expect(getEmailSettings(user,{...identity,id:foreign.id})).rejects.toMatchObject({status:403});
});
it('never retries unknown or accepted outcomes, and PostgreSQL protects attempt/result identity',async()=>{
 for(const kind of ['UNKNOWN','ACCEPTED'] as const){const m=(await update())!;const a=await outcome(m,kind);await expect(changeEmailSettings(user,identity,{action:'RETRY',messageId:m,requestKey:randomUUID(),acknowledgement:true})).rejects.toMatchObject({status:409});await expect(db.query('INSERT INTO email_attempt(id,message_id,ordinal,request_key)VALUES($1,$2,2,$3)',[randomUUID(),m,randomUUID()])).rejects.toThrow(/rejected/);await expect(db.query("UPDATE email_result SET reason='SMTP_ACCEPTED' WHERE attempt_id=$1",[a])).rejects.toThrow(/immutable/);}
 const m=(await update())!;const a=(await db.query('SELECT id FROM email_attempt WHERE message_id=$1',[m])).rows[0].id;await expect(db.query("INSERT INTO email_result(attempt_id,outcome,reason)VALUES($1,'ACCEPTED','SMTP_ACCEPTED')",[a])).rejects.toThrow(/dispatched/);
});
it('does no queue processing or external call while sending is disabled',async()=>{vi.stubEnv('EMAIL_SEND_ENABLED','false');const send=vi.spyOn(provider,'sendInboxMail');expect(await processEmailBatch()).toMatchObject({disabled:true,accepted:0});expect(send).not.toHaveBeenCalled();});
it('cancels pending messages after permission changes under the actual restricted role without contacting SMTP',async()=>{
 await preference(false);const runtime=new Pool({connectionString:process.env.TEST_RUNTIME_DATABASE_URL,max:1});const connect=vi.spyOn(db,'connect').mockImplementation(()=>runtime.connect() as any);
 const send=vi.spyOn(provider,'sendInboxMail');vi.spyOn(provider,'gmailSettings').mockReturnValue({user:'synthetic@gmail.com',password:'abcdefghijklmnop'});vi.stubEnv('APP_ORIGIN','http://localhost:3100');vi.stubEnv('EMAIL_SEND_ENABLED','true');
 try{
  expect((await runtime.query('SELECT current_user role')).rows[0].role).toBe('rent2go_app');
  const current=await getEmailSettings(user,identity);await changeEmailSettings(user,identity,{action:'PREFERENCE',version:current.version,enabled:true,acknowledgement:true});
  const notification=randomUUID();await runtime.query("INSERT INTO app_notification(id,recipient_id,application_id,message)VALUES($1,$2,$3,'Synthetic runtime queue check')",[notification,user.id,application]);
  const m=(await runtime.query('SELECT id FROM email_message WHERE notification_id=$1',[notification])).rows[0].id,a=(await runtime.query('SELECT id FROM email_attempt WHERE message_id=$1',[m])).rows[0].id;
  await runtime.query('UPDATE email_attempt SET dispatch_at=clock_timestamp() WHERE id=$1',[a]);await runtime.query("INSERT INTO email_result(attempt_id,outcome,reason)VALUES($1,'REJECTED','SMTP_REJECTED')",[a]);
  await changeEmailSettings(user,identity,{action:'RETRY',messageId:m,requestKey:randomUUID(),acknowledgement:true});
  const changed=await getEmailSettings(user,identity);await changeEmailSettings(user,identity,{action:'PREFERENCE',version:changed.version,enabled:false,acknowledgement:true});
  expect((await processEmailBatch()).cancelled).toBeGreaterThan(0);expect(send).not.toHaveBeenCalled();
  await expect(runtime.query("UPDATE email_message SET email='forged@example.test' WHERE recipient_id=$1",[user.id])).rejects.toMatchObject({code:'42501'});
  await expect(runtime.query('UPDATE email_message SET id=id WHERE id=$1',[m])).rejects.toThrow(/immutable/);
 }finally{connect.mockRestore();await runtime.end();}
 await preference(true);
});
it('claims one message once across concurrent workers and saves acceptance after the SMTP call without holding database locks',async()=>{
 await retirePending();const m=(await update())!;await new Promise(resolve=>setTimeout(resolve,5100));
 vi.spyOn(provider,'gmailSettings').mockReturnValue({user:'synthetic@gmail.com',password:'abcdefghijklmnop'});vi.stubEnv('APP_ORIGIN','http://localhost:3100');vi.stubEnv('EMAIL_SEND_ENABLED','true');
 const send=vi.spyOn(provider,'sendInboxMail').mockImplementation(async(email,id)=>{expect(email).toBe(identity.email);expect(id).toMatch(/^<[a-f0-9-]+@rent2go.invalid>$/);const c=await db.connect();try{await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='1s'");await c.query('SELECT id FROM email_attempt WHERE message_id=$1 FOR UPDATE NOWAIT',[m]);await c.query('ROLLBACK');}finally{c.release();}return {outcome:'ACCEPTED',reason:'SMTP_ACCEPTED'};});
 await Promise.all([processEmailBatch(),processEmailBatch()]);expect(send).toHaveBeenCalledOnce();expect((await getEmailSettings(user,identity)).items.find(i=>i.id===m)?.status).toBe('ACCEPTED');
 await processEmailBatch();expect(send).toHaveBeenCalledOnce();
});
it('bounds explicit rejected retries at three and provides complete paginated recipient history',async()=>{
 const m=(await update())!;for(let n=1;n<=3;n++){await outcome(m,'REJECTED');if(n<3)await changeEmailSettings(user,identity,{action:'RETRY',messageId:m,requestKey:randomUUID(),acknowledgement:true});}
 await expect(changeEmailSettings(user,identity,{action:'RETRY',messageId:m,requestKey:randomUUID(),acknowledgement:true})).rejects.toMatchObject({status:409});expect((await getEmailSettings(user,identity)).items.find(i=>i.id===m)?.canRetry).toBe(false);
 for(let n=0;n<21;n++)await update();const first=await getEmailSettings(user,identity),second=await getEmailSettings(user,identity,{page:2});expect(first.items).toHaveLength(20);expect(second.items.length).toBeGreaterThan(0);expect(new Set([...first.items,...second.items].map(i=>i.id)).size).toBe(first.total);await retirePending();
},60000);
it('recovers an expired dispatched attempt as unknown once, including when sending is paused, without resending it',async()=>{
 const m=(await update())!,a=(await db.query('SELECT id FROM email_attempt WHERE message_id=$1',[m])).rows[0].id;
 // Historical crash fixture only, inside the explicitly isolated database. Re-enable
 // the guard before committing so no application transaction can observe it disabled.
 const c=await db.connect();try{await c.query('BEGIN');await c.query('ALTER TABLE email_attempt DISABLE TRIGGER protect_email_attempt');await c.query("UPDATE email_attempt SET created_at=clock_timestamp()-interval '5 minutes',dispatch_at=clock_timestamp()-interval '3 minutes' WHERE id=$1",[a]);await c.query('ALTER TABLE email_attempt ENABLE TRIGGER protect_email_attempt');await c.query('COMMIT');}finally{await c.query('ROLLBACK');c.release();}
 vi.stubEnv('EMAIL_SEND_ENABLED','false');const send=vi.spyOn(provider,'sendInboxMail');expect(await recoverInterruptedEmails()).toBeGreaterThan(0);expect(await recoverInterruptedEmails()).toBe(0);expect(send).not.toHaveBeenCalled();const item=(await getEmailSettings(user,identity)).items.find(i=>i.id===m);expect(item?.status).toBe('UNKNOWN');expect(item?.canRetry).toBe(false);await expect(changeEmailSettings(user,identity,{action:'RETRY',messageId:m,requestKey:randomUUID(),acknowledgement:true})).rejects.toMatchObject({status:409});
});
