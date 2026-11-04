import { requireActor } from "@/lib/auth";
import { apiError, json, readJson, requireOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { addToCart, readCart } from "@/modules/cart/service";
export async function GET() {
  try {
    return json(await readCart(await requireActor()));
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: Request) {
  try {
    requireOrigin(req);
    const actor = await requireActor();
    await rateLimit(`${actor.id}:cart-writes`);
    return json(await addToCart(actor, await readJson(req)), 201);
  } catch (e) {
    return apiError(e);
  }
}
