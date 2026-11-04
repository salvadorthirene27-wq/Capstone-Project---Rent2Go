import { Pool, type PoolClient } from "pg";

const globalDb = globalThis as unknown as { rent2goPool?: Pool };
export const db =
  globalDb.rent2goPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  });
if (process.env.NODE_ENV !== "production") globalDb.rent2goPool = db;
function connectionError(error: Error & { code?: string }) {
  const code =
    error.code && /^[A-Z0-9_]{2,30}$/.test(error.code) ? error.code : "UNKNOWN";
  console.error("Database connection closed", { code });
}
// pg-pool purges failed idle clients; checked-out clients also emit errors.
// Listening prevents an uncaught EventEmitter exception. Pending queries still
// reject, and a failed transaction is never retried or reported as successful.
if (db.listenerCount("error") === 0) db.on("error", connectionError);
if (db.listenerCount("connect") === 0)
  db.on("connect", (client) => client.on("error", connectionError));
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const value = await fn(client);
    await client.query("COMMIT");
    return value;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
