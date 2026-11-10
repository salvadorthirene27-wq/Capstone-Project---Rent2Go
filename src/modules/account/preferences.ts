import { z } from "zod";
import { transaction } from "@/lib/db";
import { storedActor } from "@/modules/partners/service";
import type { Actor } from "@/modules/partners/workflow";

const phone = z.string().trim().max(30).refine(value => !value || (
  /^[+\d()\s-]+$/.test(value) && value.replace(/\D/g, "").length >= 7
), "Enter a phone number with at least seven digits.");

const profile = z.object({
  action: z.literal("PROFILE"),
  phone,
  emergencyContact: z.string().trim().max(120),
  address: z.string().trim().max(400),
}).strict();

const payment = z.object({
  action: z.literal("PAYMENT"),
  preference: z.enum(["PAYMONGO", "AGENCY"]).nullable(),
}).strict();

export const accountPreferencesCommand = z.discriminatedUnion("action", [profile, payment]);
type Command = z.infer<typeof accountPreferencesCommand>;

export async function accountPreferences(actor: Actor) {
  return transaction(async client => {
    const user = await storedActor(actor, client);
    const { rows: [row] } = await client.query<{
      phone: string | null;
      emergency_contact: string | null;
      address: string | null;
      payment_preference: "PAYMONGO" | "AGENCY" | null;
      joined: Date;
      completed: number;
    }>(`SELECT p.phone, p.emergency_contact, p.address, p.payment_preference,
              a.created_at AS joined,
              (SELECT count(*)::int FROM booking_request r
               WHERE r.renter_id=a.id AND r.status='COMPLETED') AS completed
         FROM app_actor a LEFT JOIN account_preferences p ON p.actor_id=a.id WHERE a.id=$1`, [user.id]);
    return {
      phone: row.phone ?? "",
      emergencyContact: row.emergency_contact ?? "",
      address: row.address ?? "",
      preference: row.payment_preference,
      joined: row.joined.toISOString(),
      completed: row.completed,
    };
  });
}

export async function saveAccountPreferences(actor: Actor, command: Command) {
  return transaction(async client => {
    // Serialize writes with account deactivation before checking the current actor.
    await client.query("SELECT id FROM app_actor WHERE id=$1 FOR UPDATE", [actor.id]);
    const user = await storedActor(actor, client);
    if (command.action === "PROFILE") {
      await client.query(`INSERT INTO account_preferences(actor_id,phone,emergency_contact,address)
        VALUES($1,$2,$3,$4) ON CONFLICT(actor_id) DO UPDATE SET
        phone=excluded.phone, emergency_contact=excluded.emergency_contact, address=excluded.address`,
      [user.id, command.phone, command.emergencyContact, command.address]);
    } else {
      await client.query(`INSERT INTO account_preferences(actor_id,payment_preference)
        VALUES($1,$2) ON CONFLICT(actor_id) DO UPDATE SET payment_preference=excluded.payment_preference`,
      [user.id, command.preference]);
    }
  });
}

export type AccountPreferences = Awaited<ReturnType<typeof accountPreferences>>;
