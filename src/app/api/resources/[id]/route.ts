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
import { resourceDetail, updateDriver } from "@/modules/resources/service";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, ctx: Context) {
  try {
    return json(
      await resourceDetail(
        await requireActor(),
        uuid.parse((await ctx.params).id),
        z.coerce
          .number()
          .int()
          .min(1)
          .max(10000)
          .parse(new URL(req.url).searchParams.get("page") ?? 1),
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: Request, ctx: Context) {
  try {
    requireOrigin(req);
    const actor = await requireActor(),
      id = uuid.parse((await ctx.params).id),
      body = z
        .object({
          action: z.literal("SAVE_DRIVER"),
          version: versionSchema,
          payload: z.unknown(),
        })
        .strict()
        .parse(await readJson(req));
    await rateLimit(`${actor.id}:resource-writes`);
    return json(await updateDriver(actor, id, body.version, body.payload));
  } catch (e) {
    return apiError(e);
  }
}
