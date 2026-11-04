import { z } from "zod";
import { requireActor } from "@/lib/auth";
import {
  apiError,
  json,
  readJson,
  requireOrigin,
  uuid,
  versionSchema,
} from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { scheduleSchema } from "@/modules/tours/schema";
import { createTourSchedule } from "@/modules/tours/service";
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    requireOrigin(req);
    const actor = await requireActor(),
      id = uuid.parse((await ctx.params).id),
      body = z
        .object({ version: versionSchema, payload: scheduleSchema })
        .strict()
        .parse(await readJson(req));
    await rateLimit(`${actor.id}:tour-writes`);
    return json(
      await createTourSchedule(actor, id, body.version, body.payload),
      201,
    );
  } catch (e) {
    return apiError(e);
  }
}
