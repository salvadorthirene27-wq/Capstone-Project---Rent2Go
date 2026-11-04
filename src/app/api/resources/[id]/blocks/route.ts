import { requireActor } from "@/lib/auth";
import { apiError, json, readJson, requireOrigin, uuid } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { createBlock } from "@/modules/resources/service";
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    requireOrigin(req);
    const actor = await requireActor(),
      id = uuid.parse((await ctx.params).id);
    await rateLimit(`${actor.id}:resource-writes`);
    return json(await createBlock(actor, id, await readJson(req)), 201);
  } catch (e) {
    return apiError(e);
  }
}
