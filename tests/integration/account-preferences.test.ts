import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { Pool } from "pg";
import { db } from "../../src/lib/db";
import {
  accountPreferences,
  accountPreferencesCommand,
  saveAccountPreferences,
} from "../../src/modules/account/preferences";
import type { Actor } from "../../src/modules/partners/workflow";

it("keeps preferences private, preserves independent saves, and rejects suspended actors", async () => {
  const target = new URL(process.env.DATABASE_URL ?? "");
  const runtimeTarget = new URL(process.env.TEST_RUNTIME_DATABASE_URL ?? "");
  if ([target, runtimeTarget].some(url => url.pathname !== "/rent2go_test" || !url.hostname.startsWith("ep-dawn-rain-aowtcdg5"))) {
    throw Error("Use the isolated Rent2Go database.");
  }
  const runtime = new Pool({ connectionString: runtimeTarget.toString() });
  const first: Actor = { id: randomUUID(), role: "RENTER" };
  const other: Actor = { id: randomUUID(), role: "RENTER" };
  try {
    await db.query("INSERT INTO app_actor(id,email,name) VALUES($1,$1||'@example.test','Renter one'),($2,$2||'@example.test','Renter two')", [first.id, other.id]);
    await saveAccountPreferences(first, accountPreferencesCommand.parse({
      action: "PROFILE", phone: "+63 917 555 0100", emergencyContact: "", address: "An example address",
    }));
    await saveAccountPreferences(first, { action: "PAYMENT", preference: "PAYMONGO" });
    expect(await accountPreferences(first)).toMatchObject({
      phone: "+63 917 555 0100", address: "An example address", preference: "PAYMONGO",
    });
    expect(await accountPreferences(other)).toMatchObject({ phone: "", address: "", preference: null });
    const allowed = await runtime.query("SELECT has_table_privilege(current_user,'account_preferences','SELECT,INSERT') can_read_insert, has_column_privilege(current_user,'account_preferences','payment_preference','UPDATE') can_update");
    expect(allowed.rows[0]).toEqual({ can_read_insert: true, can_update: true });
    expect(accountPreferencesCommand.safeParse({action:"PAYMENT", preference:"PAYMONGO", cardNumber:"unexpected"}).success).toBe(false);
    await db.query("UPDATE app_actor SET suspended=true WHERE id=$1", [first.id]);
    await expect(saveAccountPreferences(first, { action: "PAYMENT", preference: null })).rejects.toMatchObject({ status: 403 });
  } finally {
    await runtime.end();
    await db.query("DELETE FROM account_preferences WHERE actor_id=ANY($1::text[])", [[first.id, other.id]]);
    await db.query("DELETE FROM app_actor WHERE id=ANY($1::text[])", [[first.id, other.id]]);
  }
}, 30000);
