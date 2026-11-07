import {afterAll,beforeAll,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {hashPassword,verifyPassword} from '@better-auth/utils/password';
import {db} from '../../src/lib/db';
const id=randomUUID(),email=`${id}@example.test`;let digest:string;
beforeAll(async()=>{
 if(new URL(process.env.DATABASE_URL!).pathname!=='/rent2go_test')throw Error('Isolated test database required');
 // Minimal managed-schema-shaped fixtures only in the isolated database. Real
 // managed users/passwords are never copied or updated by this test.
 await db.query('CREATE SCHEMA IF NOT EXISTS neon_auth');await db.query('CREATE TABLE IF NOT EXISTS neon_auth."user"(id uuid PRIMARY KEY,email text NOT NULL UNIQUE)');await db.query('CREATE TABLE IF NOT EXISTS neon_auth.account(id uuid PRIMARY KEY,"userId" uuid NOT NULL,"providerId" text NOT NULL,password text)');
 digest=await hashPassword('SyntheticCurrent!234');await db.query('INSERT INTO neon_auth."user"(id,email)VALUES($1,$2)',[id,email]);await db.query('INSERT INTO neon_auth.account(id,"userId","providerId",password)VALUES($1,$2,\'credential\',$3)',[randomUUID(),id,digest]);
},60000);
afterAll(()=>db.end());
it('permits the narrow internal read while denying direct managed credential access to the restricted runtime',async()=>{
 const runtime=new Pool({connectionString:process.env.TEST_RUNTIME_DATABASE_URL,max:1});try{
  expect((await runtime.query('SELECT current_user role')).rows[0].role).toBe('rent2go_app');const found=(await runtime.query('SELECT rent2go_current_credential_digest($1) digest',[email.toUpperCase()])).rows[0].digest;expect(await verifyPassword(found,'SyntheticCurrent!234')).toBe(true);expect(await verifyPassword(found,'SyntheticDifferent!234')).toBe(false);
  await expect(runtime.query('SELECT password FROM neon_auth.account WHERE "userId"=$1',[id])).rejects.toMatchObject({code:'42501'});
  expect((await runtime.query('SELECT rent2go_current_credential_digest($1) digest',[`${randomUUID()}@example.test`])).rows[0].digest).toBeNull();
 }finally{await runtime.end();}
});
it('does not permit ordinary PUBLIC execution or change any credential on lookup',async()=>{
 const access=(await db.query("SELECT p.prosecdef, p.proconfig,acldefault('f',p.proowner)::text defaults,p.proacl::text acl FROM pg_proc p WHERE p.oid='rent2go_current_credential_digest(text)'::regprocedure")).rows[0];expect(access.prosecdef).toBe(true);expect(access.proconfig).toContain('search_path=pg_catalog');expect(access.acl).not.toMatch(/(?:\{|,)=X\//);expect((await db.query('SELECT password FROM neon_auth.account WHERE "userId"=$1',[id])).rows[0].password).toBe(digest);
});
