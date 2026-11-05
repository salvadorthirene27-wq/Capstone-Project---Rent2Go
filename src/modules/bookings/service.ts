import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "../../lib/db";
import { storedActor, audit } from "../partners/service";
import { DomainError, type Actor } from "../partners/workflow";
import { agencyOperatingContext } from "../agencies/service";
import {
  lockCartSources,
  quoteCartSelectionInTransaction,
} from "../cart/service";
import { digest, type CartQuote } from "../cart/pricing";
import type { Selection } from "../cart/schema";
import { checkoutSchema, bookingListSchema } from "./schema";
type CheckoutResult = {
  requests: {
    id: string;
    agencyId: string;
    agencyName: string;
    status: "REQUIREMENTS_PENDING";
  }[];
  cartVersion: number;
};
type CartRow = {
  id: string;
  version: number;
  selection: Selection;
  saved_quote: CartQuote;
};
async function snapshots(c: PoolClient, q: CartQuote) {
  const p = (
    await c.query(
      "SELECT r.payload FROM agency a JOIN partner_revision r ON r.application_id=a.application_id AND r.revision=$2 WHERE a.id=$1",
      [q.agencyId, q.policyRevision],
    )
  ).rows[0].payload;
  const policy = Object.fromEntries(
    [
      "businessName",
      "eligibilityTerms",
      "terms",
      "cancellationPolicy",
      "refundPolicy",
      "damagePolicy",
      "latePolicy",
      "inclusions",
      "exclusions",
      "acceptedMethods",
      "holdHours",
      "bufferMinutes",
    ].map((key) => [key, p[key]]),
  );
  if (q.selection.kind === "RENTAL") {
    const r = (
      await c.query(
        "SELECT r.facts,r.terms,v.id AS vehicle_id,v.ownership,v.owner_actor_id FROM vehicle_offer o JOIN physical_vehicle v ON v.id=o.vehicle_id JOIN vehicle_revision r ON r.offer_id=o.id AND r.revision=$2 WHERE o.id=$1",
        [q.selection.offerId, q.sourceRevision],
      )
    ).rows[0];
    const { shares, ...publicTerms } = r.terms;
    return {
      policy,
      service: { facts: r.facts, terms: publicTerms },
      financial: {
        category: r.ownership,
        vehicleId: r.vehicle_id,
        cosignerId: r.owner_actor_id,
        shares,
        allocationBasis: r.terms.allocationBasis,
        driverCompensation:
          q.selection.mode === "WITH_DRIVER"
            ? "REQUIRES_SEPARATE_QUOTE_RULE"
            : "NOT_APPLICABLE",
      },
    };
  }
  const r = (
    await c.query(
      "SELECT payload,agency_bps,platform_bps FROM tour_revision WHERE tour_id=$1 AND revision=$2",
      [q.selection.tourId, q.sourceRevision],
    )
  ).rows[0];
  return {
    policy,
    service: r.payload,
    financial: {
      category: "TOUR_ONLY",
      shares: {
        cosigner: 0,
        agency: r.agency_bps,
        platform: r.platform_bps,
        maintenance: 0,
      },
      allocationBasis: "SERVICE_REVENUE_EXCLUDING_REFUNDABLE_DEPOSIT",
    },
  };
}
export async function submitBookingRequests(
  actor: Actor,
  input: unknown,
): Promise<CheckoutResult> {
  const command = checkoutSchema.parse(input);
  command.items.sort((a, b) => a.id.localeCompare(b.id));
  const hash = digest(command);
  return transaction(async (c) => {
    const user = await storedActor(actor, c);
    // The permanent owner cart serializes all of this actor's checkout retries.
    const cart = (
      await c.query(
        "SELECT id,version FROM booking_cart WHERE owner_id=$1 FOR UPDATE",
        [user.id],
      )
    ).rows[0];
    if (!cart)
      throw new DomainError(
        "Your cart is empty. Add a service before submitting a request.",
        409,
      );
    const previous = (
      await c.query(
        "SELECT command_hash,result FROM booking_checkout_command WHERE actor_id=$1 AND idempotency_key=$2",
        [user.id, command.idempotencyKey],
      )
    ).rows[0];
    if (previous) {
      if (previous.command_hash !== hash)
        throw new DomainError(
          "This submission key was already used for a different request. Reload checkout and try again.",
          409,
        );
      return previous.result as CheckoutResult;
    }
    if (cart.version !== command.cartVersion)
      throw new DomainError(
        "Your cart changed. Review it again before submitting.",
        409,
      );
    const rows = (
      await c.query<CartRow>(
        "SELECT id,version,selection,saved_quote FROM cart_item WHERE cart_id=$1 AND id=ANY($2::uuid[]) AND removed_at IS NULL ORDER BY id",
        [cart.id, command.items.map((i) => i.id)],
      )
    ).rows;
    if (rows.length !== command.items.length)
      throw new DomainError(
        "Some selected items are no longer in your cart. Review your cart again.",
        409,
      );
    await lockCartSources(
      c,
      rows.map((r) => r.selection),
    );
    const reviewed: CartQuote[] = [];
    for (const row of rows) {
      const item = command.items.find((i) => i.id === row.id)!;
      if (
        item.version !== row.version ||
        item.quoteDigest !== row.saved_quote.digest
      )
        throw new DomainError(
          "A selected cart item changed. Review the latest estimate before submitting.",
          409,
        );
      const current = await quoteCartSelectionInTransaction(
        c,
        user,
        row.selection,
      );
      if (current.digest !== row.saved_quote.digest)
        throw new DomainError(
          "A service price or policy changed. Review the current estimate in your cart before submitting.",
          409,
        );
      reviewed.push(current);
    }
    const requests: CheckoutResult["requests"] = [];
    for (const agencyId of [
      ...new Set(reviewed.map((q) => q.agencyId)),
    ].sort()) {
      const quote = reviewed.find((q) => q.agencyId === agencyId)!,
        id = randomUUID();
      await c.query(
        "INSERT INTO booking_request(id,agency_id,renter_id,agency_name,contact)VALUES($1,$2,$3,$4,$5)",
        [
          id,
          agencyId,
          user.id,
          quote.agencyName,
          JSON.stringify({ ...command.contact, email: user.email }),
        ],
      );
      for (let index = 0; index < rows.length; index++) {
        const q = reviewed[index];
        if (q.agencyId !== agencyId) continue;
        const snapshot = await snapshots(c, q);
        await c.query(
          "INSERT INTO booking_request_line(id,request_id,agency_id,cart_item_id,public_quote,service_snapshot,policy_snapshot,private_financial_snapshot)VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            randomUUID(),
            id,
            agencyId,
            rows[index].id,
            JSON.stringify(q),
            JSON.stringify(snapshot.service),
            JSON.stringify(snapshot.policy),
            JSON.stringify(snapshot.financial),
          ],
        );
      }
      await c.query(
        "INSERT INTO booking_event(id,request_id,actor_id,action,message)VALUES($1,$2,$3,'REQUEST_SUBMITTED','Request submitted. Requirements and agency review are pending; inventory is not reserved.')",
        [randomUUID(), id, user.id],
      );
      const recipients = (
        await c.query(
          "SELECT DISTINCT id FROM app_actor WHERE NOT suspended AND (id=$1 OR id IN (SELECT owner_id FROM agency WHERE id=$2) OR id IN(SELECT actor_id FROM agency_member WHERE agency_id=$2 AND active))",
          [user.id, agencyId],
        )
      ).rows;
      for (const recipient of recipients)
        await c.query(
          "INSERT INTO booking_notification(id,request_id,recipient_id,message)VALUES($1,$2,$3,'A booking request was submitted. Requirements and review are pending.')",
          [randomUUID(), id, recipient.id],
        );
      await audit(c, user, "BOOKING_REQUEST_SUBMITTED", id, {
        agencyId,
        cartId: cart.id,
      });
      requests.push({
        id,
        agencyId,
        agencyName: quote.agencyName,
        status: "REQUIREMENTS_PENDING",
      });
    }
    await c.query(
      "UPDATE cart_item SET removed_at=now(),version=version+1,updated_at=now() WHERE id=ANY($1::uuid[])",
      [rows.map((r) => r.id)],
    );
    const cartVersion = Number(
      (
        await c.query(
          "UPDATE booking_cart SET version=version+1,updated_at=now() WHERE id=$1 RETURNING version",
          [cart.id],
        )
      ).rows[0].version,
    );
    const result = { requests, cartVersion };
    await c.query(
      "INSERT INTO booking_checkout_command(actor_id,idempotency_key,command_hash,result)VALUES($1,$2,$3,$4)",
      [user.id, command.idempotencyKey, hash, JSON.stringify(result)],
    );
    return result;
  });
}
type RequestRow = {
  id: string;
  agency_id: string;
  renter_id: string;
  agency_name: string;
  status: string;
  version: number;
  contact: { name: string; phone: string; email: string; notes: string };
  created_at: Date;
  payment_environment?: "MANUAL"|"DEMO"|null;
};
const paymentEnvironmentSql="(SELECT a.environment FROM booking_quotation q LEFT JOIN booking_payment_account a ON a.quote_id=q.id WHERE q.request_id=r.id ORDER BY q.revision DESC LIMIT 1)";
const summary = (r: RequestRow) => ({
  id: r.id,
  agencyId: r.agency_id,
  agencyName: r.agency_name,
  status: r.status,
  version: r.version,
  contact: r.contact,
  createdAt: r.created_at.toISOString(),
  paymentEnvironment: r.payment_environment??null,
});
export async function getBookingRequest(actor: Actor, id: string) {
  if (!z.uuid().safeParse(id).success)
    throw new DomainError("Booking request not found.", 404);
  return transaction(async (c) => {
    const user = await storedActor(actor, c),
      row = (
        await c.query<RequestRow>(`SELECT r.*,${paymentEnvironmentSql} AS payment_environment FROM booking_request r WHERE r.id=$1`, [
          id,
        ])
      ).rows[0];
    if (!row) throw new DomainError("Booking request not found.", 404);
    if (row.renter_id !== user.id) {
      const agency = await agencyOperatingContext(c, user, row.agency_id);
      if (!agency.operatesAgency)
        throw new DomainError("Booking request not found.", 404);
    }
    // Private financial snapshots never appear in renter or ordinary queue views.
    const lines = (
      await c.query(
        "SELECT id,public_quote AS quote,policy_snapshot AS policy FROM booking_request_line WHERE request_id=$1 ORDER BY created_at,id",
        [id],
      )
    ).rows as {
      id: string;
      quote: CartQuote;
      policy: Record<string, unknown>;
    }[];
    const events = (
      await c.query(
        "SELECT id,action,message,created_at FROM booking_event WHERE request_id=$1 ORDER BY created_at,id",
        [id],
      )
    ).rows;
    const totals = {
      serviceCentavos: 0,
      refundableDepositCentavos: 0,
      estimatedDueCentavos: 0,
    };
    for (const line of lines)
      for (const key of Object.keys(totals) as (keyof typeof totals)[])
        totals[key] += line.quote.estimate[key];
    return {
      ...summary(row),
      isOwnRequest: row.renter_id === user.id,
      lines,
      events,
      totals,
    };
  });
}
export async function listBookingRequests(actor: Actor, input: unknown = {}) {
  const q = bookingListSchema.parse(input);
  return transaction(async (c) => {
    const user = await storedActor(actor, c);
    if (q.agencyId) {
      const agency = await agencyOperatingContext(c, user, q.agencyId);
      if (!agency.operatesAgency)
        throw new DomainError("Active agency access required.", 403);
    }
    const where = q.agencyId ? "agency_id=$1" : "renter_id=$1",
      value = q.agencyId ?? user.id;
    const total = Number(
      (
        await c.query(`SELECT count(*) n FROM booking_request WHERE ${where}`, [
          value,
        ])
      ).rows[0].n,
    );
    const rows = (
      await c.query<RequestRow>(
        `SELECT r.*,${paymentEnvironmentSql} AS payment_environment FROM booking_request r WHERE ${where} ORDER BY r.created_at DESC,r.id LIMIT 20 OFFSET $2`,
        [value, (q.page - 1) * 20],
      )
    ).rows;
    return {
      items: rows.map(summary),
      total,
      page: q.page,
      pageCount: Math.max(1, Math.ceil(total / 20)),
    };
  });
}
