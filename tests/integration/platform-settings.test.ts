import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {db} from '../../src/lib/db';
import {getPlatformSettings,publishPlatformSettings} from '../../src/modules/platform/service';
import {readPolicy,readPlatformTerms} from '../../src/modules/platform/read';
import {createApplication} from '../../src/modules/partners/service';
import {digest} from '../../src/modules/cart/pricing';
import {approvedAgency} from '../helpers/agency';
const admin={id:randomUUID(),role:'SUPER_ADMIN' as const},owner={id:randomUUID(),role:'RENTER' as const},user={id:randomUUID(),role:'RENTER' as const},demoted={id:randomUUID(),role:'SUPER_ADMIN' as const};
let original:Awaited<ReturnType<typeof readPolicy>>;
const input=(v:Awaited<ReturnType<typeof getPlatformSettings>>,suffix:string)=>({version:v.version,digest:v.digest,payload:{...v.payload,termsText:`${v.payload.termsText}\n\nSynthetic publication ${suffix}.`},reason:'Independent synthetic platform policy review.',acknowledged:true,idempotencyKey:randomUUID()});
beforeAll(async()=>{if(new URL(process.env.DATABASE_URL!).pathname!=='/rent2go_test')throw Error('Isolated target required.');for(const a of [admin,owner,user,demoted])await db.query("INSERT INTO app_actor(id,email,name,role)VALUES($1,$2,'Synthetic policy actor',$3)",[a.id,`${a.id}@example.test`,a.role]);original=await readPolicy();},30000);
afterAll(async()=>{try{if(original){const v=await getPlatformSettings(admin);if(v.digest!==original.digest)await publishPlatformSettings(admin,{version:v.version,digest:v.digest,payload:original.payload,reason:'Restore the original isolated policy after focused verification.',acknowledged:true,idempotencyKey:randomUUID()});}}finally{await db.end();}},30000);
it('verifies the seeded digest and denies forged, fixture and revoked administrator claims',async()=>{
 expect(original.digest).toBe(digest(original.payload));await expect(getPlatformSettings({...user,role:'SUPER_ADMIN'})).rejects.toMatchObject({status:403});await expect(publishPlatformSettings(user,input(await getPlatformSettings(admin),'denied'))).rejects.toMatchObject({status:403});
 await db.query("UPDATE app_actor SET role='COSIGNER' WHERE id=$1",[demoted.id]);await expect(getPlatformSettings(demoted)).rejects.toMatchObject({status:403});
 await db.query('UPDATE app_actor SET is_test_fixture=true WHERE id=$1',[demoted.id]);await expect(getPlatformSettings(demoted)).rejects.toMatchObject({status:403});
});
it('publishes under restricted runtime grants exactly once and retains old public versions',async()=>{
 const v=await getPlatformSettings(admin),command=input(v,'restricted runtime'),runtime=new Pool({connectionString:process.env.TEST_RUNTIME_DATABASE_URL,max:2}),spy=vi.spyOn(db,'connect').mockImplementation(()=>runtime.connect() as any);let next;
 try{next=await publishPlatformSettings(admin,command);expect((await publishPlatformSettings(admin,command)).revision).toBe(next.revision);await expect(publishPlatformSettings(admin,{...command,reason:'A different reviewed reason.'})).rejects.toMatchObject({status:409});}finally{spy.mockRestore();await runtime.end();}
 expect(next!.revision).toBe(v.revision+1);expect((await readPolicy(undefined,v.revision)).payload).toEqual(v.payload);expect(next!.payload.consignedDefaults).toEqual(v.payload.consignedDefaults);expect((await db.query('SELECT count(*) n FROM platform_policy_command WHERE actor_id=$1 AND request_key=$2',[admin.id,command.idempotencyKey])).rows[0].n).toBe('1');await expect(publishPlatformSettings(admin,{...input(v,'stale')})).rejects.toMatchObject({status:409});
});
it('serializes conflicting publications and rechecks actor authority after waiting',async()=>{
 const v=await getPlatformSettings(admin),outcomes=await Promise.allSettled([publishPlatformSettings(admin,input(v,'first race')),publishPlatformSettings(admin,input(v,'second race'))]);expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect((outcomes.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.status).toBe(409);
 const fresh=await getPlatformSettings(admin),c=await db.connect();try{await c.query('BEGIN');await c.query('UPDATE app_actor SET suspended=true WHERE id=$1',[admin.id]);const pending=publishPlatformSettings(admin,input(fresh,'revoked while waiting'));await c.query('COMMIT');await expect(pending).rejects.toMatchObject({status:403});}finally{await c.query('ROLLBACK');c.release();await db.query('UPDATE app_actor SET suspended=false WHERE id=$1',[admin.id]);}expect((await getPlatformSettings(admin)).revision).toBe(fresh.revision);
},30000);
it('starts a new application from the published default without replacing an existing negotiated draft',async()=>{
 const p=await readPolicy(),first=await createApplication(user);expect(first.platformDefaultsRevision).toBe(p.revision);expect(first.payload.split).toEqual(p.payload.consignedDefaults);
 const saved={...first.payload,split:{cosigner:6000,agency:2000,platform:1000,maintenance:1000}};await db.query('UPDATE partner_application SET payload=$2 WHERE id=$1',[first.id,saved]);await publishPlatformSettings(admin,input(await getPlatformSettings(admin),'later terms'));const existing=await createApplication(user);expect(existing.id).toBe(first.id);expect(existing.payload).toEqual(saved);expect(existing.platformDefaultsRevision).toBe(first.platformDefaultsRevision);
});
it('enforces append-only policy history and exact quotation terms without retroactively requiring them on legacy records',async()=>{
 const agency=await approvedAgency(owner,admin),request=randomUUID(),terms=await readPlatformTerms(db);await db.query("INSERT INTO booking_request(id,agency_id,renter_id,agency_name,status,contact)VALUES($1,$2,$3,'Synthetic policy agency','READY_FOR_APPROVAL','{}')",[request,agency,user.id]);
 const insert=(value:unknown,revision:number|null)=>db.query("INSERT INTO booking_quotation(id,request_id,revision,digest,issued_by,issued_at,expires_at,public_snapshot,platform_terms_revision)VALUES($1,$2,(SELECT coalesce(max(revision),0)+1 FROM booking_quotation WHERE request_id=$2),$3,$4,clock_timestamp(),clock_timestamp()+interval '1 day',$5,$6)",[randomUUID(),request,'a'.repeat(64),owner.id,value,revision]);
 await expect(insert({platformTerms:{...terms,text:'Changed after review'}},terms.revision)).rejects.toMatchObject({code:'23514'});await insert({platformTerms:terms},terms.revision);await insert({legacy:true},null);
 await expect(db.query('UPDATE platform_policy_revision SET reason=reason WHERE revision=$1',[terms.revision])).rejects.toThrow();await expect(db.query('UPDATE platform_policy SET revision=revision WHERE singleton')).rejects.toThrow();await expect(db.query('DELETE FROM platform_policy_command WHERE actor_id=$1',[admin.id])).rejects.toThrow();
},60000);
it('schedules review without granting private-file access or deleting any evidence',async()=>{
 const before=Number((await db.query('SELECT count(*) n FROM booking_requirement_file')).rows[0].n),v=await getPlatformSettings(admin);const next=await publishPlatformSettings(admin,{...input(v,'review interval'),payload:{...v.payload,inactiveEvidenceReviewDays:30}});expect(Number.isInteger(next.reviewCandidates)).toBe(true);expect(Number((await db.query('SELECT count(*) n FROM booking_requirement_file')).rows[0].n)).toBeGreaterThanOrEqual(before);
});
