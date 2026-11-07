import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {db} from '../../src/lib/db';
import {getGovernanceUser,getGovernanceUsers,changeGovernanceUser} from '../../src/modules/governance/users';
import {getAuditReview} from '../../src/modules/governance/audit';
const admin={id:randomUUID(),role:'SUPER_ADMIN' as const},user={id:randomUUID(),role:'RENTER' as const},foreign={id:randomUUID(),role:'RENTER' as const};
const command=(v:{version:number;digest:string},action:string)=>({idempotencyKey:randomUUID(),version:v.version,digest:v.digest,action,reason:'Independent synthetic access review.',acknowledged:true});
beforeAll(async()=>{if(new URL(process.env.DATABASE_URL!).pathname!=='/rent2go_test')throw Error('Isolated database required.');for(const u of [admin,user,foreign])await db.query("INSERT INTO app_actor(id,email,name,role)VALUES($1,$2,$3,$4)",[u.id,`${u.id}@example.test`,`Governance ${u.id}`,u.role]);},30000);
afterAll(()=>db.end());
it('limits user governance to current platform authority and literal searches, excluding email and service accounts',async()=>{
 await expect(getGovernanceUsers(user)).rejects.toMatchObject({status:403});await expect(getGovernanceUser(foreign,user.id)).rejects.toMatchObject({status:403});const directory=await getGovernanceUsers(admin,{search:user.id});expect(directory.items).toHaveLength(1);expect(directory.items[0].id).toBe(user.id);expect(JSON.stringify(directory)).not.toContain('@example.test');expect((await getGovernanceUsers(admin,{search:'%'})).items).toHaveLength(0);const self=await getGovernanceUser(admin,admin.id);await expect(changeGovernanceUser(admin,admin.id,command(self,'SUSPEND'))).rejects.toMatchObject({status:403});
});
it('records exact role changes once, rejects stale actions and never creates an agency relationship through a role alone',async()=>{
 let v=await getGovernanceUser(admin,user.id);await expect(changeGovernanceUser(admin,user.id,{...command(v,'CHANGE_ROLE'),role:'AGENCY_ADMIN'})).rejects.toMatchObject({status:409});const input={...command(v,'CHANGE_ROLE'),role:'COSIGNER'};
 const runtime=new Pool({connectionString:process.env.TEST_RUNTIME_DATABASE_URL,max:2}),spy=vi.spyOn(db,'connect').mockImplementation(()=>runtime.connect() as any);try{v=await changeGovernanceUser(admin,user.id,input);expect((await changeGovernanceUser(admin,user.id,input)).version).toBe(v.version);}finally{spy.mockRestore();await runtime.end();}
 expect(v.role).toBe('COSIGNER');expect(v.version).toBe(2);await expect(changeGovernanceUser(admin,user.id,{...input,idempotencyKey:randomUUID(),role:'SUPER_ADMIN'})).rejects.toMatchObject({status:409});expect((await db.query('SELECT 1 FROM agency_member WHERE actor_id=$1',[user.id])).rowCount).toBe(0);expect((await db.query('SELECT 1 FROM account_governance_event WHERE subject_id=$1',[user.id])).rowCount).toBe(1);
});
it('keeps suspension distinct from cancellation and restores the original account role without rewriting its history',async()=>{
 let v=await getGovernanceUser(admin,user.id);v=await changeGovernanceUser(admin,user.id,command(v,'SUSPEND'));expect(v.suspended).toBe(true);expect(v.role).toBe('COSIGNER');await expect(getGovernanceUser(user,user.id)).rejects.toMatchObject({status:403});v=await changeGovernanceUser(admin,user.id,command(v,'REACTIVATE'));expect(v.suspended).toBe(false);expect(v.history).toHaveLength(3);expect(v.history[1].action).toBe('SUSPEND');
});
it('preserves a last active administrator even against direct SQL and keeps the original row after rejection',async()=>{
 // A transaction-local actor table exercises the actual trigger without
 // locking or changing other suites' administrator fixtures.
 const c=await db.connect();try{await c.query('BEGIN');await c.query('CREATE TEMP TABLE app_actor (LIKE public.app_actor INCLUDING ALL) ON COMMIT DROP');await c.query('SET LOCAL search_path=pg_temp,public');await c.query('CREATE TRIGGER fixture_governance_guard BEFORE UPDATE ON app_actor FOR EACH ROW EXECUTE FUNCTION public.advance_actor_governance()');await c.query("INSERT INTO app_actor(id,email,name,role)VALUES($1,'last@example.test','Only fixture admin','SUPER_ADMIN')",[admin.id]);await expect(c.query('UPDATE app_actor SET suspended=true WHERE id=$1',[admin.id])).rejects.toMatchObject({code:'23514'});}finally{await c.query('ROLLBACK');c.release();}expect((await getGovernanceUser(admin,admin.id)).suspended).toBe(false);
});
it('exposes only whitelisted operational audit context and denies private metadata expansion',async()=>{
 await db.query("INSERT INTO app_audit(id,actor_id,action,entity_id,metadata)VALUES($1,$2,'SYNTHETIC_GOVERNANCE_AUDIT',$3,$4)",[randomUUID(),admin.id,randomUUID(),{environment:'DEMO',rowCount:2,reason:'PRIVATE PERSONAL DETAILS',email:'private@example.test',token:'SECRET_TOKEN',fileId:randomUUID()}]);expect((await getAuditReview(admin,{action:''})).items.length).toBeGreaterThan(0);const r=await getAuditReview(admin,{action:'SYNTHETIC_GOVERNANCE_AUDIT'});expect(r.items[0].context).toEqual({environment:'DEMO',rowCount:2});expect(JSON.stringify(r)).not.toContain('PRIVATE');expect(JSON.stringify(r)).not.toContain('SECRET');expect(JSON.stringify(r)).not.toContain('@');await expect(getAuditReview(foreign)).rejects.toMatchObject({status:403});
});
