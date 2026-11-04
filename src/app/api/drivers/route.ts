import { requireActor } from "@/lib/auth";
import { apiError, json, readJson, requireOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { createDriver } from "@/modules/resources/service";
export async function POST(req: Request) {
  try {
    requireOrigin(req);
    const actor = await requireActor();
    await rateLimit(`${actor.id}:resource-writes`);
    return json(await createDriver(actor, await readJson(req)), 201);
  } catch (e) {
    return apiError(e);
  }
}
