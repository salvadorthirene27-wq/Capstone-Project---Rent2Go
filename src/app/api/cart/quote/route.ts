import { requireActor } from "@/lib/auth";
import { apiError, json, readJson, requireOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { quoteCartSelection } from "@/modules/cart/service";
export async function POST(req: Request) {
  try {
    requireOrigin(req);
    const actor = await requireActor();
    await rateLimit(`${actor.id}:cart-estimates`);
    return json(await quoteCartSelection(actor, await readJson(req)));
  } catch (e) {
    return apiError(e);
  }
}
