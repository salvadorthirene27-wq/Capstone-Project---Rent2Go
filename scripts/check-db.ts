import {Client} from "pg";

// Read-only diagnostics. Never print connection strings, passwords or raw errors.
const flags=process.argv.slice(2);
if(flags.some(f=>!["--test","--direct"].includes(f)))throw Error("Use only --test or --direct.");
if(process.env.NEON_PROJECT_ID!=="floral-flower-08375841"||!process.env.DATABASE_URL)throw Error("Configure the existing Rent2Go project first.");
const target=new URL(process.env.DATABASE_URL);
if(!target.hostname.startsWith("ep-dawn-rain-aowtcdg5")||target.pathname!=="/rent2go"||decodeURIComponent(target.username)!=="rent2go_app")throw Error("Unexpected runtime database target.");
if(flags.includes("--test"))target.pathname="/rent2go_test";
if(flags.includes("--direct"))target.hostname=target.hostname.replace("-pooler.",".");
const client=new Client({connectionString:target.toString(),connectionTimeoutMillis:15000});
const started=Date.now();
try{
 await client.connect();
 const {rows}=await client.query("SELECT current_database() AS database,current_user AS role,to_regclass('public.booking_request') IS NOT NULL AS app_schema_present");
 console.log(JSON.stringify({ok:true,...rows[0],transport:flags.includes("--direct")?"direct":"configured",elapsedMs:Date.now()-started}));
}catch(error){
 const e=error as Error&{code?:string};
 const code=e.code&&/^[A-Z0-9_]{2,30}$/.test(e.code)?e.code:"CONNECTION_FAILED";
 const category=/timeout/i.test(e.message)?"TIMEOUT":code==="28P01"?"AUTHENTICATION":"CONNECTION";
 console.error(JSON.stringify({ok:false,code,category,elapsedMs:Date.now()-started}));process.exitCode=1;
}finally{await client.end();}
