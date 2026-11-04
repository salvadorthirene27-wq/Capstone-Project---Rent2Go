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
import { tourSchema } from "@/modules/tours/schema";
import {
  tourDetail,
  saveTour,
  publishTour,
  withdrawTour,
  removeTourPhoto,
} from "@/modules/tours/service";
type Context = { params: Promise<{ id: string }> };
const command = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("SAVE"),
      version: versionSchema,
      payload: tourSchema,
    })
    .strict(),
  z.object({ action: z.literal("PUBLISH"), version: versionSchema }).strict(),
  z
    .object({
      action: z.literal("WITHDRAW"),
      version: versionSchema,
      reason: z.string().trim().min(10).max(2000),
    })
    .strict(),
  z
    .object({
      action: z.literal("REMOVE_PHOTO"),
      version: versionSchema,
      fileId: uuid,
    })
    .strict(),
]);
export async function GET(req: Request, ctx: Context) {
  try {
    return json(
      await tourDetail(
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
      body = command.parse(await readJson(req));
    await rateLimit(`${actor.id}:tour-writes`);
    return json(
      body.action === "SAVE"
        ? await saveTour(actor, id, body.version, body.payload)
        : body.action === "PUBLISH"
          ? await publishTour(actor, id, body.version)
          : body.action === "WITHDRAW"
            ? await withdrawTour(actor, id, body.version, body.reason)
            : await removeTourPhoto(actor, id, body.version, body.fileId),
    );
  } catch (e) {
    return apiError(e);
  }
}
