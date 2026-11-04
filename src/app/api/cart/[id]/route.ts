import { z } from "zod";
import { requireActor } from "@/lib/auth";
import { apiError, json, readJson, requireOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { updateCartItem, removeCartItem } from "@/modules/cart/service";
import { cartCommandSchema } from "@/modules/cart/schema";
const command = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("UPDATE"),
      version: z.number().int().positive(),
      payload: cartCommandSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("REMOVE"),
      version: z.number().int().positive(),
    })
    .strict(),
]);
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireOrigin(req);
    const actor = await requireActor();
    await rateLimit(`${actor.id}:cart-writes`);
    const id = z.uuid().parse((await context.params).id),
      input = command.parse(await readJson(req));
    return json(
      input.action === "UPDATE"
        ? await updateCartItem(actor, id, input.version, input.payload)
        : await removeCartItem(actor, id, input.version),
    );
  } catch (e) {
    return apiError(e);
  }
}
