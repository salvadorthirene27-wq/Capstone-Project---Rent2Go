import path from 'node:path';
import {createHash} from 'node:crypto';
export const recoveryProject='floral-flower-08375841';
export function sourceTarget(connection:string,project:string|undefined){
 const u=new URL(connection);if(!['postgresql:','postgres:'].includes(u.protocol)||project!==recoveryProject||u.pathname!=='/rent2go'||!/^ep-dawn-rain-aowtcdg5(-pooler)?\.[a-z0-9.-]+\.neon\.tech$/.test(u.hostname)||decodeURIComponent(u.username)!=='rent2go_owner')throw Error('Unexpected recovery source.');u.hostname=u.hostname.replace('-pooler.','.');return u;
}
export function restoreTarget(source:URL,name:string){if(!/^rent2go_restore_[0-9]{8}_[a-f0-9]{12}$/.test(name))throw Error('Restore requires a newly named isolated database.');const u=new URL(source);u.pathname='/'+name;return u;}
export function privateBackupFolder(input:string,repo=process.cwd()){
 const resolved=path.resolve(input),app=path.resolve(repo),relative=path.relative(app,resolved);if(!relative||!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative))throw Error('Private backups must remain outside the repository.');return resolved;
}
export function objectDestination(root:string,key:string){if(!/^[a-f0-9-]+\/[a-f0-9-]+$/.test(key))throw Error('Invalid private object key.');const r=path.resolve(root),p=path.resolve(r,...key.split('/'));if(!p.startsWith(r+path.sep))throw Error('Object path escaped its restore folder.');return p;}
export function sha256(value:Uint8Array|string){return createHash('sha256').update(value).digest('hex');}
export function tableDigest(rows:string[]){return sha256(rows.slice().sort().join('\n')+(rows.length?'\n':''));}
export function isolatedRestoreCatalog(catalog:string){let skipped=0;const text=catalog.split(/\r?\n/).map(line=>{if(/^\d+;.* DEFAULT ACL .* cloud_admin$/.test(line.trim())){skipped++;return '; Provider-owned default privilege retained in archive: '+line;}return line;}).join('\n');return {text,skipped};}
export const fileTables={
 central_disbursement_file:{key:"request_id::text||'/'||f.id::text",actor:'uploaded_by',backend:'backend',size:'size_bytes'},
 private_file:{key:'object_key',actor:'owner_id',backend:'storage_driver',size:'size_bytes'},
 vehicle_file:{key:'object_key',actor:'uploader_id',backend:'backend',size:'size_bytes'},
 tour_file:{key:'object_key',actor:'uploader_id',backend:'backend',size:'size_bytes'},
 booking_requirement_file:{key:"request_id::text||'/'||f.id::text",actor:'uploader_id',backend:'backend',size:'size'},
 booking_agreement_signature:{key:"request_id::text||'/'||f.id::text",actor:'signer_id',backend:'backend',size:'size_bytes'},
 booking_inspection_file:{key:"request_id::text||'/'||f.id::text",actor:'uploader_id',backend:'backend',size:'size_bytes'},
 booking_payment_attempt:{key:"request_id::text||'/'||file_id::text",actor:'actor_id',backend:'backend',size:'size_bytes'},
 booking_refund_attempt:{key:"request_id::text||'/'||file_id::text",actor:'actor_id',backend:'backend',size:'size_bytes'},
 owner_payout_attempt:{key:"account_id::text||'/'||file_id::text",actor:'actor_id',backend:'backend',size:'size_bytes'},
 platform_remittance_attempt:{key:"account_id::text||'/'||file_id::text",actor:'actor_id',backend:'backend',size:'size_bytes'},
} as const;
