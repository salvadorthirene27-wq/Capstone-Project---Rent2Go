import type {PoolClient} from 'pg';
import {tableDigest} from './recovery';
// Compare actual runtime permissions, including grants limited to a column.
// This reads access metadata only and never changes a role or source grant.
export async function runtimeAccessDigest(c:Pick<PoolClient,'query'>){
 const r=await c.query(`WITH scopes AS (SELECT oid,nspname FROM pg_namespace WHERE nspname IN ('public','neon_auth')),
 access AS (
 SELECT 'SCHEMA' kind,n.nspname schema,n.nspname name,json_build_array(has_schema_privilege('rent2go_app',n.oid,'USAGE'),has_schema_privilege('rent2go_app',n.oid,'CREATE'))::text value FROM scopes n
 UNION ALL SELECT 'TABLE',n.nspname,t.relname,json_build_array(has_table_privilege('rent2go_app',t.oid,'SELECT'),has_table_privilege('rent2go_app',t.oid,'INSERT'),has_table_privilege('rent2go_app',t.oid,'UPDATE'),has_table_privilege('rent2go_app',t.oid,'DELETE'),has_table_privilege('rent2go_app',t.oid,'TRUNCATE'),has_table_privilege('rent2go_app',t.oid,'REFERENCES'),has_table_privilege('rent2go_app',t.oid,'TRIGGER'))::text FROM pg_class t JOIN scopes n ON n.oid=t.relnamespace WHERE t.relkind IN ('r','p','v','m')
 UNION ALL SELECT 'COLUMN',n.nspname,t.relname||'.'||a.attname,json_build_array(has_column_privilege('rent2go_app',t.oid,a.attnum,'SELECT'),has_column_privilege('rent2go_app',t.oid,a.attnum,'INSERT'),has_column_privilege('rent2go_app',t.oid,a.attnum,'UPDATE'),has_column_privilege('rent2go_app',t.oid,a.attnum,'REFERENCES'))::text FROM pg_attribute a JOIN pg_class t ON t.oid=a.attrelid JOIN scopes n ON n.oid=t.relnamespace WHERE t.relkind IN ('r','p','v','m') AND a.attnum>0 AND NOT a.attisdropped
 UNION ALL SELECT 'FUNCTION',n.nspname,p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',has_function_privilege('rent2go_app',p.oid,'EXECUTE')::text FROM pg_proc p JOIN scopes n ON n.oid=p.pronamespace
 ) SELECT row_to_json(access)::text value FROM access ORDER BY kind,schema,name`);
 return {entries:r.rowCount??0,sha256:tableDigest(r.rows.map(row=>row.value as string))};
}
