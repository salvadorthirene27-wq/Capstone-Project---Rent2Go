import {Pool,type PoolClient} from 'pg';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile,access,copyFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {rootCertificates} from 'node:tls';
import {loadFile} from '../src/lib/storage';
import {runtimeAccessDigest} from './lib/recovery-access';
import {db} from '../src/lib/db';
import {fileTables,isolatedRestoreCatalog,objectDestination,privateBackupFolder,recoveryProject,restoreTarget,sha256,sourceTarget,tableDigest} from './lib/recovery';
type Table={schema:string;table:string;rows:number;sha256:string};
type ObjectRecord={key:string;backend:'s3'|'local';bytes:number;sha256:string;table:string};
type Manifest={format:1;kind:'RENT2GO_LOGICAL_RECOVERY_PACKAGE';project:string;capturedAt:string;sourceVersion:string;restoreDatabase:string;archiveSha256:string;tables:Table[];objects:ObjectRecord[];excludedFixtureObjects:number;limitations:string[]};
const quote=(name:string)=>'"'+name.replaceAll('"','""')+'"';
const flag=process.argv[2],args=process.argv.slice(3);
let folder:string,bin:string,source:URL,pool:Pool;
function pgEnvironment(target:URL){return {...process.env,PGHOST:target.hostname,PGPORT:target.port||'5432',PGUSER:decodeURIComponent(target.username),PGPASSWORD:decodeURIComponent(target.password),PGDATABASE:target.pathname.slice(1),PGSSLMODE:'verify-full',PGSSLROOTCERT:path.join(folder,'client-trust.pem'),PGCHANNELBINDING:'require',PGCONNECT_TIMEOUT:'15',PGAPPNAME:'rent2go_recovery'};}
async function pg(program:'pg_dump'|'pg_restore',arguments_:string[],target:URL,log:string){
 await writeFile(path.join(folder,'client-trust.pem'),rootCertificates.join('\n')+'\n');
 const executable=path.join(bin,program+(process.platform==='win32'?'.exe':''));await access(executable);
 const chunks:Buffer[]=[];const status=await new Promise<number|null>((resolve,reject)=>{const child=spawn(executable,arguments_,{env:pgEnvironment(target),windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>chunks.push(Buffer.from(b)));child.stderr.on('data',b=>chunks.push(Buffer.from(b)));child.on('error',reject);child.on('close',resolve);});
 await writeFile(path.join(folder,log),Buffer.concat(chunks),{flag:'wx'});if(status!==0)throw Error(`${program} stopped; inspect its private log.`);return Buffer.concat(chunks).toString('utf8');
}
async function fingerprints(c:PoolClient){
 const relations=(await c.query("SELECT schemaname AS schema,tablename AS table FROM pg_tables WHERE schemaname NOT LIKE 'pg_%' AND schemaname<>'information_schema' ORDER BY schemaname,tablename")).rows as {schema:string;table:string}[],result:Table[]=[];
 for(const r of relations){const rows=(await c.query(`SELECT row_to_json(t)::text AS json FROM ${quote(r.schema)}.${quote(r.table)} t`)).rows.map(r=>r.json as string);result.push({...r,rows:rows.length,sha256:tableDigest(rows)});}return result;
}
async function objectReferences(c:PoolClient){
 const discovered=(await c.query("SELECT table_name FROM information_schema.columns WHERE table_schema='public' GROUP BY table_name HAVING bool_or(column_name='sha256') AND bool_or(column_name IN ('backend','storage_driver')) ORDER BY table_name")).rows.map(r=>r.table_name as string),result:ObjectRecord[]=[];let excluded=0;
 for(const table of discovered){if(!Object.hasOwn(fileTables,table))throw Error('A file table has no reviewed recovery mapping.');const d=fileTables[table as keyof typeof fileTables],rows=(await c.query(`SELECT ${d.key} AS key,f.${d.backend} AS backend,f.${d.size} AS bytes,f.sha256,a.is_test_fixture FROM ${quote(table)} f JOIN app_actor a ON a.id=f.${d.actor} WHERE f.${d.backend} IS NOT NULL`)).rows;
  for(const r of rows){if(r.is_test_fixture){excluded++;continue;}objectDestination(folder,r.key);if(!['s3','local'].includes(r.backend)||!Number.isSafeInteger(r.bytes)||r.bytes<=0||!/^[a-f0-9]{64}$/.test(r.sha256))throw Error('A retained file has invalid recovery metadata.');const object={key:r.key,backend:r.backend,bytes:r.bytes,sha256:r.sha256,table} as ObjectRecord,prior=result.find(o=>o.key===object.key);if(prior&&(prior.backend!==object.backend||prior.bytes!==object.bytes||prior.sha256!==object.sha256))throw Error('Conflicting private object references.');if(!prior)result.push(object);}
 }return {objects:result,excluded};
}
async function exportPackage(){
 await mkdir(folder,{recursive:false});const c=await pool.connect();try{
  await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");await c.query("SET LOCAL TIME ZONE 'UTC'");const snapshot=(await c.query('SELECT pg_export_snapshot() value')).rows[0].value as string;if(!/^[A-Fa-f0-9-]+$/.test(snapshot))throw Error('Unexpected database snapshot identifier.');
  const capturedAt=(await c.query('SELECT clock_timestamp() value')).rows[0].value.toISOString(),sourceVersion=(await c.query("SELECT current_setting('server_version') value")).rows[0].value as string,tables=await fingerprints(c),refs=await objectReferences(c);
  await pg('pg_dump',['--format=custom','--snapshot='+snapshot,'--file='+path.join(folder,'database.dump')],source,'export-private.log');
  for(const object of refs.objects){const bytes=await loadFile(object.key,object.backend);if(bytes.length!==object.bytes||sha256(bytes)!==object.sha256)throw Error('A retained private object does not match its saved file metadata.');const dest=objectDestination(path.join(folder,'objects'),object.key);await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,bytes,{flag:'wx'});}
  await c.query('COMMIT');const manifest:Manifest={format:1,kind:'RENT2GO_LOGICAL_RECOVERY_PACKAGE',project:recoveryProject,capturedAt,sourceVersion,restoreDatabase:'rent2go_restore_'+new Date().toISOString().slice(0,10).replaceAll('-','')+'_'+randomBytes(6).toString('hex'),archiveSha256:sha256(await readFile(path.join(folder,'database.dump'))),tables,objects:refs.objects,excludedFixtureObjects:refs.excluded,limitations:['Database and managed-auth records are included; PostgreSQL roles/passwords and external provider settings outside this database are not exported.','Fixture-marked actors intentionally use non-operational evidence; their metadata is retained in the database and their file bytes are excluded.','Objects are staged by exact keys, not uploaded over the current bucket. External provider cutover and bucket failover are separate operator steps.']};
  await writeFile(path.join(folder,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});console.log(JSON.stringify({result:'exported',tables:tables.length,rows:tables.reduce((n,t)=>n+t.rows,0),objects:refs.objects.length,excludedFixtureObjects:refs.excluded}));
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
}
async function restorePackage(){
 const m=JSON.parse(await readFile(path.join(folder,'manifest.json'),'utf8')) as Manifest;
 if(m.format!==1||m.kind!=='RENT2GO_LOGICAL_RECOVERY_PACKAGE'||m.project!==recoveryProject||!Array.isArray(m.tables)||!Array.isArray(m.objects))throw Error('Unexpected recovery package.');let name=m.restoreDatabase;if(await access(path.join(folder,'restore-verification.json')).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;}))throw Error('This package already has a verified isolated restore.');if((await pool.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount)name='rent2go_restore_'+new Date().toISOString().slice(0,10).replaceAll('-','')+'_'+randomBytes(6).toString('hex');const target=restoreTarget(source,name);
 if(sha256(await readFile(path.join(folder,'database.dump')))!==m.archiveSha256)throw Error('Database archive integrity check failed.');
 for(const o of m.objects){const bytes=await readFile(objectDestination(path.join(folder,'objects'),o.key));if(bytes.length!==o.bytes||sha256(bytes)!==o.sha256)throw Error('Private object archive integrity check failed.');}
 if((await pool.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount)throw Error('The isolated restore target already exists; never overwrite it.');
 await writeFile(path.join(folder,`restore-attempt-${name}.json`),JSON.stringify({database:name,archiveSha256:m.archiveSha256,startedAt:new Date().toISOString()}),{flag:'wx'});
 await pool.query(`CREATE DATABASE ${quote(name)} OWNER ${quote(decodeURIComponent(source.username))}`);
 await pool.query(`REVOKE CONNECT ON DATABASE ${quote(name)} FROM PUBLIC`);
 const catalog=isolatedRestoreCatalog(await pg('pg_restore',['--list',path.join(folder,'database.dump')],target,`catalog-${name}-private.log`)),listFile=path.join(folder,`catalog-${name}.toc`);await writeFile(listFile,catalog.text,{flag:'wx'});
 await pg('pg_restore',['--no-owner','--exit-on-error','--single-transaction','--use-list='+listFile,'--dbname='+name,path.join(folder,'database.dump')],target,`restore-${name}-private.log`);
 const restored=new Pool({connectionString:target.toString(),max:1,connectionTimeoutMillis:10000}),c=await restored.connect();try{
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await c.query("SET LOCAL TIME ZONE 'UTC'");const actual=await fingerprints(c);if(JSON.stringify(actual)!==JSON.stringify(m.tables))throw Error('Restored table counts or exact row hashes do not match.');const sourceAccess=await runtimeAccessDigest(pool),restoredAccess=await runtimeAccessDigest(c);if(sourceAccess.sha256!==restoredAccess.sha256||sourceAccess.entries!==restoredAccess.entries)throw Error('Restored runtime permissions differ from the source; no successful recovery is claimed.');await c.query('COMMIT');
  const staged=path.join(folder,`restored-objects-${name}`);await mkdir(staged,{recursive:false});for(const o of m.objects){const src=objectDestination(path.join(folder,'objects'),o.key),dest=objectDestination(staged,o.key);await mkdir(path.dirname(dest),{recursive:true});await copyFile(src,dest,1);const bytes=await readFile(dest);if(bytes.length!==o.bytes||sha256(bytes)!==o.sha256)throw Error('Restored object byte check failed.');}
  const proof={result:'verified',at:new Date().toISOString(),database:name,tables:actual.length,rows:actual.reduce((n,t)=>n+t.rows,0),authTables:actual.filter(t=>t.schema==='neon_auth').length,objects:m.objects.length,excludedFixtureObjects:m.excludedFixtureObjects,providerDefaultAclStatementsRetainedInArchive:catalog.skipped,runtimePermissionEntries:restoredAccess.entries,runtimePermissionsMatched:true,objectRestoreFolder:path.basename(staged),scope:'Exact logical database records including managed-auth tables and restored private object bytes. Primary/test databases, current bucket and provider endpoints remain unchanged. External provider cutover was not exercised.'};await writeFile(path.join(folder,'restore-verification.json'),JSON.stringify(proof,null,2),{flag:'wx'});console.log(JSON.stringify(proof));
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();await restored.end();}
}
async function main(){try{
 if(!['export','restore-isolated'].includes(flag)||args.length!==4||args[0]!=='--tools'||args[2]!=='--folder')throw Error('Use export|restore-isolated --tools ABSOLUTE_PG_BIN --folder PRIVATE_BACKUP_FOLDER.');
 folder=privateBackupFolder(args[3]);bin=path.resolve(args[1]);source=sourceTarget(process.env.MIGRATION_DATABASE_URL??'',process.env.NEON_PROJECT_ID);pool=new Pool({connectionString:source.toString(),max:2,connectionTimeoutMillis:10000});
 if(flag==='export')await exportPackage();else await restorePackage();
}catch(error){if(folder)await writeFile(path.join(folder,`recovery-error-${Date.now()}-private.log`),error instanceof Error?error.stack??error.name:'Unknown error',{flag:'wx'}).catch(()=>{});console.error(JSON.stringify({result:'failed',type:error instanceof Error?error.name:'unknown',detail:'Recovery stopped. Inspect the private package logs; existing primary and test data are not overwritten.'}));process.exitCode=1;}finally{if(pool)await pool.end();await db.end();}}
await main();
