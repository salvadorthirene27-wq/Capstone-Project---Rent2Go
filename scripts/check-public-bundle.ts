import { readdir,readFile } from "node:fs/promises";
import path from "node:path";
const keys=["DATABASE_URL","MIGRATION_DATABASE_URL","TEST_DATABASE_URL","NEON_AUTH_COOKIE_SECRET","AWS_SECRET_ACCESS_KEY"];
const secrets=keys.map(key=>({key,value:process.env[key]})).filter((x):x is {key:string;value:string}=>!!x.value&&x.value.length>=12);
if(secrets.length<4)throw Error("Load the local environment before checking the public bundle.");
let files=0;
for(const entry of await readdir(".next/static",{recursive:true})){
  if(!entry.endsWith(".js")&&!entry.endsWith(".map"))continue;
  const content=await readFile(path.join(".next/static",entry),"utf8");files++;
  for(const secret of secrets)if(content.includes(secret.value))throw Error(`Private ${secret.key} found in a public bundle. Do not publish this build.`);
}
console.log(`Checked ${files} public JavaScript/map files: configured database, cookie and storage secrets are absent.`);
