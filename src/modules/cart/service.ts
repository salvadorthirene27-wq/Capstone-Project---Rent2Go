import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "../../lib/db";
import { storedActor, audit } from "../partners/service";
import { DomainError, type Actor } from "../partners/workflow";
import { agencyOperatingContext } from "../agencies/service";
import { searchVehicles } from "../marketplace/vehicles";
import { publicTour } from "../tours/service";
import { tourPrice } from "../tours/schema";
import { cartCommandSchema, selectionSchema, type Selection } from "./schema";
import { digest, fingerprint, type CartQuote } from "./pricing";
class Unavailable extends DomainError {
  constructor(message: string) {
    super(message, 409);
  }
}
type ItemRow = {
  id: string;
  version: number;
  selection: Selection;
  saved_quote: CartQuote;
  fingerprint: string;
};
// Lock sources and all agencies before actor locks in agencyOperatingContext.
// One transaction client is used throughout; no nested pool acquisition.
async function lockSources(c: PoolClient, selections: Selection[]) {
  const cars = selections
    .filter((s) => s.kind === "RENTAL")
    .map((s) => s.offerId);
  const tours = selections
    .filter((s) => s.kind === "TOUR")
    .map((s) => s.tourId);
  const carRows = await c.query(
    "SELECT id,agency_id FROM vehicle_offer WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE",
    [cars],
  );
  const tourRows = await c.query(
    "SELECT id,agency_id FROM tour_package WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE",
    [tours],
  );
  const agencies = [
    ...new Set([...carRows.rows, ...tourRows.rows].map((r) => r.agency_id)),
  ];
  await c.query(
    "SELECT id FROM agency WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE",
    [agencies],
  );
}
async function quote(
  c: PoolClient,
  actor: Actor,
  selection: Selection,
): Promise<CartQuote> {
  let base: Omit<CartQuote, "digest">;
  if (selection.kind === "RENTAL") {
    if (
      Date.parse(selection.startAt) <= Date.now() ||
      Date.parse(selection.endAt) <= Date.parse(selection.startAt)
    )
      throw new Unavailable("Choose a future pickup and a later return.");
    const car = (
      await searchVehicles(
        {
          id: selection.offerId,
          startAt: selection.startAt,
          endAt: selection.endAt,
          mode: selection.mode,
          partySize: selection.partySize,
        },
        c,
      )
    ).items[0];
    if (!car?.estimate)
      throw new Unavailable(
        "This vehicle is unavailable for the selected dates, mode or guest count. Choose another selection.",
      );
    const agency = await agencyOperatingContext(c, actor, car.agencyId);
    if (!agency.active)
      throw new Unavailable("This agency is currently unavailable.");
    base = {
      selection,
      agencyId: car.agencyId,
      agencyName: car.agencyName,
      policyRevision: agency.revision,
      sourceRevision: car.revision,
      title: `${car.facts.make} ${car.facts.model}`,
      photoId: car.photoIds[0] ?? null,
      startAt: selection.startAt,
      endAt: selection.endAt,
      priceUnit: car.pricing.billingUnit,
      estimate: car.estimate,
      constraints: {
        minParty: 1,
        maxParty: car.facts.seats,
        modes: car.pricing.modes,
      },
    };
  } else {
    const tour = await publicTour(selection.tourId, {}, c).catch((e) => {
      if (e instanceof DomainError && e.status === 404)
        throw new Unavailable(
          "This tour is no longer published. Choose another package.",
        );
      throw e;
    });
    const slot = (
      await c.query(
        "SELECT * FROM tour_schedule WHERE id=$1 AND tour_id=$2 AND revision=$3 AND status='SCHEDULED' AND cutoff_at>now()",
        [selection.scheduleId, tour.id, tour.revision],
      )
    ).rows[0];
    const p = tour.payload,
      party = selection.partySize;
    if (
      !slot ||
      party < p.minParty ||
      party > p.maxParty ||
      (p.mode === "PRIVATE"
        ? slot.reserved_units !== 0 || slot.capacity < party
        : slot.capacity - slot.reserved_units < party)
    )
      throw new Unavailable(
        "This departure cannot accommodate your party. Choose another date or guest count.",
      );
    const agency = await agencyOperatingContext(c, actor, tour.agencyId);
    if (!agency.active)
      throw new Unavailable("This agency is currently unavailable.");
    let service: number;
    try {
      service = tourPrice(p, party).totalCentavos;
    } catch (e) {
      if (e instanceof DomainError) throw new Unavailable(e.message);
      throw e;
    }
    base = {
      selection,
      agencyId: tour.agencyId,
      agencyName: tour.agencyName,
      policyRevision: agency.revision,
      sourceRevision: tour.revision,
      title: p.title,
      photoId: tour.photos[0]?.id ?? null,
      startAt: new Date(slot.start_at).toISOString(),
      endAt: new Date(slot.end_at).toISOString(),
      priceUnit: tour.priceUnit,
      estimate: {
        serviceCentavos: service,
        refundableDepositCentavos: 0,
        estimatedDueCentavos: service,
      },
      constraints: { minParty: p.minParty, maxParty: p.maxParty },
    };
  }
  return { ...base, digest: digest(base) };
}
export async function quoteCartSelection(actor: Actor, input: unknown) {
  const selection = selectionSchema.parse(input);
  return transaction(async (c) => {
    const user = await storedActor(actor, c);
    await lockSources(c, [selection]);
    return quote(c, user, selection);
  });
}
async function lockedCart(
  c: PoolClient,
  actor: Actor,
  create: boolean,
  write = create,
) {
  if (create)
    await c.query(
      "INSERT INTO booking_cart(id,owner_id) VALUES($1,$2) ON CONFLICT(owner_id) DO NOTHING",
      [randomUUID(), actor.id],
    );
  return (
    await c.query(
      `SELECT id,version FROM booking_cart WHERE owner_id=$1 FOR ${write ? "UPDATE" : "SHARE"}`,
      [actor.id],
    )
  ).rows[0] as { id: string; version: number } | undefined;
}
async function bump(c: PoolClient, cartId: string) {
  return Number(
    (
      await c.query(
        "UPDATE booking_cart SET version=version+1,updated_at=now() WHERE id=$1 RETURNING version",
        [cartId],
      )
    ).rows[0].version,
  );
}
export async function addToCart(actor: Actor, input: unknown) {
  const command = cartCommandSchema.parse(input),
    s = command.selection,
    fp = fingerprint(s);
  return transaction(async (c) => {
    const user = await storedActor(actor, c),
      cart = (await lockedCart(c, user, true))!;
    const existing = (
      await c.query<ItemRow>(
        "SELECT * FROM cart_item WHERE cart_id=$1 AND fingerprint=$2 AND removed_at IS NULL",
        [cart.id, fp],
      )
    ).rows[0];
    if (existing) {
      if (
        digest(existing.selection) === digest(s) &&
        existing.saved_quote.digest === command.quoteDigest
      )
        return {
          id: existing.id,
          version: existing.version,
          cartVersion: cart.version,
          duplicate: true,
        };
      throw new DomainError(
        "This selection is already in your cart. Edit that item to change guests or review updated terms.",
        409,
      );
    }
    const count = Number(
      (
        await c.query(
          "SELECT count(*) n FROM cart_item WHERE cart_id=$1 AND removed_at IS NULL",
          [cart.id],
        )
      ).rows[0].n,
    );
    if (count >= 20)
      throw new DomainError(
        "Your cart has reached its 20-service limit. Remove an item before adding another.",
        409,
      );
    await lockSources(c, [s]);
    const current = await quote(c, user, s);
    if (current.digest !== command.quoteDigest)
      throw new DomainError(
        "The estimate or terms changed. Review the current estimate and add again.",
        409,
      );
    const id = randomUUID();
    await c.query(
      "INSERT INTO cart_item(id,cart_id,kind,selection,saved_quote,fingerprint) VALUES($1,$2,$3,$4,$5,$6)",
      [id, cart.id, s.kind, JSON.stringify(s), JSON.stringify(current), fp],
    );
    const cartVersion = await bump(c, cart.id);
    await audit(c, user, "CART_ITEM_ADDED", id, {
      cartId: cart.id,
      kind: s.kind,
    });
    return { id, version: 1, cartVersion, duplicate: false };
  });
}
export type CartLine = {
  id: string;
  version: number;
  selection: Selection;
  savedQuote: CartQuote;
  currentQuote: CartQuote | null;
  status: "CURRENT" | "CHANGED" | "UNAVAILABLE";
  reason: string | null;
};
export async function cartCount(actor: Actor) {
  return transaction(async (c) => {
    const user = await storedActor(actor, c);
    return Number(
      (
        await c.query(
          "SELECT count(*) n FROM cart_item i JOIN booking_cart c ON c.id=i.cart_id WHERE c.owner_id=$1 AND i.removed_at IS NULL",
          [user.id],
        )
      ).rows[0].n,
    );
  });
}
export async function readCart(actor: Actor) {
  return transaction(async (c) => {
    const user = await storedActor(actor, c),
      cart = await lockedCart(c, user, false);
    const rows = cart
      ? (
          await c.query<ItemRow>(
            "SELECT * FROM cart_item WHERE cart_id=$1 AND removed_at IS NULL ORDER BY created_at,id",
            [cart.id],
          )
        ).rows
      : [];
    await lockSources(
      c,
      rows.map((r) => r.selection),
    );
    const groups: { agencyId: string; name: string; items: CartLine[] }[] = [];
    const totals = {
      serviceCentavos: 0,
      refundableDepositCentavos: 0,
      estimatedDueCentavos: 0,
    };
    let ready = rows.length > 0;
    for (const row of rows) {
      const line: CartLine = {
        id: row.id,
        version: row.version,
        selection: row.selection,
        savedQuote: row.saved_quote,
        currentQuote: null,
        status: "CURRENT",
        reason: null,
      };
      try {
        line.currentQuote = await quote(c, user, row.selection);
        if (line.currentQuote.digest !== line.savedQuote.digest) {
          line.status = "CHANGED";
          line.reason =
            "Price or published terms changed. Review and accept an updated estimate.";
        }
      } catch (e) {
        if (!(e instanceof Unavailable)) throw e;
        line.status = "UNAVAILABLE";
        line.reason = e.message;
      }
      if (line.status !== "CURRENT") ready = false;
      let group = groups.find((g) => g.agencyId === line.savedQuote.agencyId);
      if (!group) {
        group = {
          agencyId: line.savedQuote.agencyId,
          name: line.savedQuote.agencyName,
          items: [],
        };
        groups.push(group);
      }
      group.items.push(line);
      for (const key of Object.keys(totals) as (keyof typeof totals)[])
        totals[key] += line.savedQuote.estimate[key];
    }
    return {
      version: cart?.version ?? 0,
      totalItems: rows.length,
      groups,
      totals,
      readyToRequest: ready,
    };
  });
}
export async function updateCartItem(
  actor: Actor,
  id: string,
  version: number,
  input: unknown,
) {
  z.uuid().parse(id);
  z.number().int().positive().parse(version);
  const command = cartCommandSchema.parse(input);
  return transaction(async (c) => {
    const user = await storedActor(actor, c),
      cart = await lockedCart(c, user, false, true);
    if (!cart) throw new DomainError("Cart item not found.", 404);
    const item = (
      await c.query<ItemRow>(
        "SELECT * FROM cart_item WHERE id=$1 AND cart_id=$2 AND removed_at IS NULL",
        [id, cart.id],
      )
    ).rows[0];
    if (!item) throw new DomainError("Cart item not found.", 404);
    if (item.version !== version)
      throw new DomainError(
        "This cart item changed in another tab. Reload and try again.",
        409,
      );
    const fp = fingerprint(command.selection),
      duplicate = await c.query(
        "SELECT 1 FROM cart_item WHERE cart_id=$1 AND fingerprint=$2 AND id<>$3 AND removed_at IS NULL",
        [cart.id, fp, id],
      );
    if (duplicate.rowCount)
      throw new DomainError(
        "That selection is already in your cart. Edit or remove the existing item.",
        409,
      );
    await lockSources(c, [command.selection]);
    const current = await quote(c, user, command.selection);
    if (current.digest !== command.quoteDigest)
      throw new DomainError(
        "The estimate or terms changed. Review the current estimate and try again.",
        409,
      );
    await c.query(
      "UPDATE cart_item SET kind=$2,selection=$3,saved_quote=$4,fingerprint=$5,version=version+1,updated_at=now() WHERE id=$1",
      [
        id,
        command.selection.kind,
        JSON.stringify(command.selection),
        JSON.stringify(current),
        fp,
      ],
    );
    const cartVersion = await bump(c, cart.id);
    await audit(c, user, "CART_ITEM_UPDATED", id, { cartId: cart.id });
    return { id, version: version + 1, cartVersion };
  });
}
export async function removeCartItem(
  actor: Actor,
  id: string,
  version: number,
) {
  z.uuid().parse(id);
  z.number().int().positive().parse(version);
  return transaction(async (c) => {
    const user = await storedActor(actor, c),
      cart = await lockedCart(c, user, false, true);
    if (!cart) throw new DomainError("Cart item not found.", 404);
    const item = (
      await c.query<ItemRow>(
        "SELECT * FROM cart_item WHERE id=$1 AND cart_id=$2 AND removed_at IS NULL",
        [id, cart.id],
      )
    ).rows[0];
    if (!item) throw new DomainError("Cart item not found.", 404);
    if (item.version !== version)
      throw new DomainError(
        "This cart item changed in another tab. Reload and try again.",
        409,
      );
    await c.query(
      "UPDATE cart_item SET removed_at=now(),version=version+1,updated_at=now() WHERE id=$1",
      [id],
    );
    const cartVersion = await bump(c, cart.id);
    await audit(c, user, "CART_ITEM_REMOVED", id, { cartId: cart.id });
    return { id, cartVersion };
  });
}
