import { Pool, type PoolClient } from "pg";

const globalDb = globalThis as unknown as { rent2goPool?: Pool };
export const db = globalDb.rent2goPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000 });
if (process.env.NODE_ENV !== "production") globalDb.rent2goPool = db;
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try { await client.query("BEGIN"); const value = await fn(client); await client.query("COMMIT"); return value; }
  catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
}
