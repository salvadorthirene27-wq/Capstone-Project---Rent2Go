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
import {
  vehicleDetail,
  saveVehicleDraft,
  transitionVehicleOffer,
  removeVehicleFile,
} from "@/modules/vehicles/service";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: Request, ctx: Context) {
  try {
    return json(
      await vehicleDetail(
        await requireActor(),
        uuid.parse((await ctx.params).id),
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
      raw = z
        .object({ action: z.string() })
        .passthrough()
        .parse(await readJson(req));
    await rateLimit(`${actor.id}:vehicle-writes`);
    if (raw.action === "SAVE") {
      const b = z
        .object({
          action: z.literal("SAVE"),
          version: versionSchema,
          payload: z.unknown(),
        })
        .strict()
        .parse(raw);
      return json(await saveVehicleDraft(actor, id, b.version, b.payload));
    }
    if (raw.action === "REMOVE_FILE") {
      const b = z
        .object({
          action: z.literal("REMOVE_FILE"),
          version: versionSchema,
          fileId: uuid,
        })
        .strict()
        .parse(raw);
      return json(await removeVehicleFile(actor, id, b.version, b.fileId));
    }
    return json(await transitionVehicleOffer(actor, id, raw));
  } catch (e) {
    return apiError(e);
  }
}
