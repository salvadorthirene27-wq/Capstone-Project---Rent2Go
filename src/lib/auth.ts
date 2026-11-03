import { createNeonAuth } from "@neon/auth/next/server";
import { db } from "./db";
import { storedActor } from "../modules/partners/service";
import { DomainError } from "../modules/partners/workflow";

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET!, sessionDataTtl: 1 },
});
export async function requireActor() {
  const { data: session, error } = await auth.getSession();
  if (error || !session?.user)
    throw new DomainError("Sign in to continue.", 401);
  const u = session.user;
  await db.query(
    "INSERT INTO app_actor(id,email,name) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING",
    [u.id, u.email, u.name || "Rent2Go user"],
  );
  return storedActor({ id: u.id });
}
