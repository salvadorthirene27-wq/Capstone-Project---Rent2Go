import { db } from "../src/lib/db";
const id = process.argv[2];
if (!id || process.env.NEON_PROJECT_ID !== "floral-flower-08375841")
  throw Error(
    "Usage: npm run admin:bootstrap -- AUTH_USER_ID (designated new project only)",
  );
try {
  const r = await db.query(
    "UPDATE app_actor SET role='SUPER_ADMIN' WHERE id=$1 RETURNING id",
    [id],
  );
  if (!r.rowCount)
    throw Error(
      "Sign in and open the workspace first, then provide that existing identity's exact ID.",
    );
  console.log(
    "Super Admin assigned to the explicitly selected existing identity.",
  );
} finally {
  await db.end();
}
