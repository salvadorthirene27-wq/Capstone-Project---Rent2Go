import { Pool } from "pg";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pooledHostname } from "./lib/connection";
if (process.env.NEON_PROJECT_ID !== "floral-flower-08375841")
  throw Error("Unexpected project target.");
const owner = process.env.MIGRATION_DATABASE_URL!;
const target = new URL(owner);
if (
  target.pathname !== "/rent2go" ||
  !target.hostname.startsWith("ep-dawn-rain-aowtcdg5")
)
  throw Error("Unexpected database target.");
const pool = new Pool({ connectionString: owner });
try {
  const roleExists = (
    await pool.query("SELECT 1 FROM pg_roles WHERE rolname='rent2go_app'")
  ).rowCount;
  let runtime = process.env.DATABASE_URL!;
  if (roleExists && new URL(runtime).username !== "rent2go_app")
    throw Error(
      "The runtime role already exists. Supply its connection URL; this setup does not rotate existing credentials.",
    );
  if (!roleExists) {
    const password = randomBytes(36).toString("hex");
    await pool.query(`CREATE ROLE rent2go_app LOGIN PASSWORD '${password}'`);
    const url = new URL(owner);
    url.username = "rent2go_app";
    url.password = password;
    runtime = url.toString();
  }
  const runtimeUrl = new URL(runtime);
  runtimeUrl.hostname = pooledHostname(runtimeUrl.hostname);
  runtimeUrl.searchParams.set("sslmode", "verify-full");
  runtime = runtimeUrl.toString();
  await pool.query("GRANT USAGE ON SCHEMA public TO rent2go_app");
  await pool.query(
    "GRANT SELECT,INSERT,UPDATE ON app_actor,partner_application,agency,private_file,app_notification TO rent2go_app",
  );
  await pool.query(
    "GRANT SELECT,INSERT ON partner_revision,partner_revision_file,partner_review,app_audit TO rent2go_app",
  );
  await pool.query(
    "GRANT SELECT,INSERT,UPDATE ON app_request_budget TO rent2go_app",
  );
  await pool.query(`DO $$ BEGIN
    IF to_regclass('public.booking_agreement') IS NOT NULL THEN
      GRANT SELECT,INSERT ON booking_agreement,booking_agreement_signature,booking_agreement_event TO rent2go_app;
    END IF;
    IF to_regclass('public.booking_quotation') IS NOT NULL THEN
      GRANT SELECT,INSERT ON booking_quotation,booking_quotation_line,booking_hold_resource,booking_hold_seat,booking_quotation_decision,booking_hold TO rent2go_app;
      GRANT UPDATE(released_at,release_reason) ON booking_hold TO rent2go_app;
    END IF;
    IF to_regclass('public.booking_requirement_file') IS NOT NULL THEN
      GRANT SELECT,INSERT ON booking_requirement_file,booking_requirement_submission,booking_requirement_selection,booking_requirement_decision TO rent2go_app;
    END IF;
    IF to_regclass('public.booking_request') IS NOT NULL THEN
      GRANT SELECT,INSERT,UPDATE ON booking_request,booking_notification TO rent2go_app;
      GRANT SELECT,INSERT ON booking_request_line,booking_event,booking_checkout_command TO rent2go_app;
    END IF;
    IF to_regclass('public.booking_cart') IS NOT NULL THEN GRANT SELECT,INSERT,UPDATE ON booking_cart,cart_item TO rent2go_app; END IF;
    IF to_regclass('public.agency_member') IS NOT NULL THEN GRANT SELECT,INSERT,UPDATE ON agency_member TO rent2go_app; END IF;
    IF to_regclass('public.vehicle_offer') IS NOT NULL THEN
      GRANT SELECT,INSERT ON physical_vehicle TO rent2go_app;
      GRANT SELECT,INSERT,UPDATE ON vehicle_offer,vehicle_file TO rent2go_app;
      GRANT SELECT,INSERT ON vehicle_revision,vehicle_agreement,vehicle_event,vehicle_revision_file TO rent2go_app;
    END IF;
    IF to_regclass('public.tour_package') IS NOT NULL THEN
      GRANT SELECT,INSERT,UPDATE ON tour_package,tour_file,tour_schedule TO rent2go_app;
      GRANT SELECT,INSERT ON tour_revision,tour_revision_file TO rent2go_app;
    END IF;
    IF to_regclass('public.resource') IS NOT NULL THEN GRANT SELECT,INSERT,UPDATE ON agency_driver,resource,resource_occupation,vehicle_maintenance TO rent2go_app; END IF;
  END $$`);
  const exists = (
    await pool.query("SELECT 1 FROM pg_database WHERE datname='rent2go_test'")
  ).rowCount;
  if (!exists)
    await pool.query("CREATE DATABASE rent2go_test OWNER rent2go_owner");
  const test = new URL(owner);
  test.pathname = "/rent2go_test";
  test.searchParams.set("sslmode", "verify-full");
  let env = await readFile(".env.local", "utf8");
  env =
    env.replace(/^LOCAL_DEMO_LOOPBACK_ALIASES=.*\r?\n?/m, "") +
    "LOCAL_DEMO_LOOPBACK_ALIASES=true\n";
  const cookieSecret = env
    .match(/^NEON_AUTH_COOKIE_SECRET=(.*)$/m)?.[1]
    ?.trim();
  if (!cookieSecret || cookieSecret.length < 32) {
    env =
      env.replace(/^NEON_AUTH_COOKIE_SECRET=.*\r?\n?/m, "") +
      `NEON_AUTH_COOKIE_SECRET=${randomBytes(48).toString("base64url")}\n`;
  }
  env = env
    .replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${runtime}`)
    .replace(/sslmode=require/g, "sslmode=verify-full");
  env =
    env.replace(/^TEST_DATABASE_URL=.*\r?\n?/m, "") +
    `TEST_DATABASE_URL=${test.toString()}\n`;
  await writeFile(".env.local", env, { mode: 0o600 });
  const runtimeCheck = new Pool({
    connectionString: runtime,
    connectionTimeoutMillis: 10000,
  });
  try {
    const result = await runtimeCheck.query("SELECT current_user");
    if (result.rows[0].current_user !== "rent2go_app")
      throw Error("Unexpected runtime database role.");
  } finally {
    await runtimeCheck.end();
  }
  console.log(
    "Restricted runtime role configured; isolated test database ready. Credentials remain in ignored .env.local.",
  );
} finally {
  await pool.end();
}
