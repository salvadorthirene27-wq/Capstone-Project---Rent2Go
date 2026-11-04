import { requireActor } from "@/lib/auth";
import { apiError, json } from "@/lib/http";
import { cartCount } from "@/modules/cart/service";
export async function GET() {
  try {
    return json({ count: await cartCount(await requireActor()) });
  } catch (e) {
    return apiError(e);
  }
}
