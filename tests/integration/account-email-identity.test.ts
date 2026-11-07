import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
const session=vi.hoisted(()=>({getSession:vi.fn()}));
vi.mock('@neon/auth/next/server',()=>({createNeonAuth:()=>({getSession:session.getSession})}));
import {db} from '../../src/lib/db';
import {requireActor} from '../../src/lib/auth';
import {getEmailSettings} from '../../src/modules/email/service';
const id=randomUUID(),email=`${id}@example.test`,changed=`changed-${id}@example.test`;
beforeAll(async()=>{if(new URL(process.env.DATABASE_URL!).pathname!=='/rent2go_test')throw Error('Isolated test database required');await db.query("INSERT INTO app_actor(id,email,name,role)VALUES($1,$2,'Synthetic identity account','COSIGNER')",[id,email]);await db.query('INSERT INTO email_preference(actor_id,email,enabled,version)VALUES($1,$2,true,1)',[id,email]);});
afterAll(async()=>{vi.restoreAllMocks();await db.end();});
it('syncs a trusted email under restricted runtime without changing application roles or transferring old email consent',async()=>{
 session.getSession.mockResolvedValue({data:{user:{id,email:changed,name:'Synthetic',role:'admin',emailVerified:true}}});
 const runtime=new Pool({connectionString:process.env.TEST_RUNTIME_DATABASE_URL,max:1}),query=vi.spyOn(db,'query').mockImplementation(((...args:any[])=>runtime.query(...args as [any])) as any),connect=vi.spyOn(db,'connect').mockImplementation(()=>runtime.connect() as any);
 try{const actor=await requireActor();expect(actor.email).toBe(changed);expect(actor.role).toBe('COSIGNER');const settings=await getEmailSettings(actor,{id,email:changed,emailVerified:true});expect(settings.emailChanged).toBe(true);expect(settings.enabled).toBe(false);expect((await runtime.query('SELECT email,role FROM app_actor WHERE id=$1',[id])).rows[0]).toEqual({email:changed,role:'COSIGNER'});}
 finally{query.mockRestore();connect.mockRestore();await runtime.end();}
});
it('preserves suspension and rejects a missing managed session',async()=>{await db.query('UPDATE app_actor SET suspended=true WHERE id=$1',[id]);try{session.getSession.mockResolvedValue({data:{user:{id,email:changed,name:'Synthetic',role:'admin'}}});await expect(requireActor()).rejects.toMatchObject({status:403});}finally{await db.query('UPDATE app_actor SET suspended=false WHERE id=$1',[id]);}session.getSession.mockResolvedValue({data:null});await expect(requireActor()).rejects.toMatchObject({status:401});});
