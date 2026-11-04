import { z } from "zod";
import { requireActor } from "@/lib/auth";
import { apiError, json, readJson, requireOrigin, uuid } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { cancelTourSchedule } from "@/modules/tours/service";
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    requireOrigin(req);
    const actor = await requireActor(),
      id = uuid.parse((await ctx.params).id),
      body = z
        .object({
          action: z.literal("CANCEL"),
          reason: z.string().trim().min(10).max(2000),
        })
        .strict()
        .parse(await readJson(req));
    await rateLimit(`${actor.id}:tour-writes`);
    return json(await cancelTourSchedule(actor, id, body.reason));
  } catch (e) {
    return apiError(e);
  }
}
