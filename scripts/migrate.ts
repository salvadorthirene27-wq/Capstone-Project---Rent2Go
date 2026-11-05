import { Pool } from "pg";
import { readFile, readdir } from "node:fs/promises";
import { grantRuntimePrivileges } from "./lib/runtime-grants";
const testMode = process.argv.includes("--test");
const connectionString = testMode
  ? process.env.TEST_DATABASE_URL
  : process.env.MIGRATION_DATABASE_URL;
if (
  !connectionString ||
  process.env.NEON_PROJECT_ID !== "floral-flower-08375841"
)
  throw Error("Set the explicitly designated NEW Rent2Go migration target.");
const target = new URL(connectionString);
if (
  target.pathname !== (testMode ? "/rent2go_test" : "/rent2go") ||
  !target.hostname.startsWith("ep-dawn-rain-aowtcdg5")
)
  throw Error("Unexpected database: refusing migration.");
const pool = new Pool({ connectionString });
const c = await pool.connect();
try {
  await c.query("SELECT pg_advisory_lock(481027)");
  await c.query(
    "CREATE TABLE IF NOT EXISTS rent2go_migration (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  for (const name of (await readdir("db/migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    if (
      (await c.query("SELECT 1 FROM rent2go_migration WHERE name=$1", [name]))
        .rowCount
    )
      continue;
    await c.query("BEGIN");
    try {
      await c.query(await readFile(`db/migrations/${name}`, "utf8"));
      await c.query("INSERT INTO rent2go_migration(name) VALUES($1)", [name]);
      await c.query("COMMIT");
      console.log(`Applied ${name}`);
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    }
  }
  if((await c.query("SELECT 1 FROM pg_roles WHERE rolname='rent2go_app'")).rowCount){
    await grantRuntimePrivileges(c);
  }
} finally {
  await c.query("SELECT pg_advisory_unlock(481027)");
  c.release();
  await pool.end();
}
