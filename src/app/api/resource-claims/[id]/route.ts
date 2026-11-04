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
import { cancelBlock, completeMaintenance } from "@/modules/resources/service";
const command = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("CANCEL"),
      reason: z.string().trim().min(10).max(2000),
    })
    .strict(),
  z
    .object({
      action: z.literal("COMPLETE"),
      version: versionSchema,
      costCentavos: z.number().int().min(0).max(100000000),
      note: z.string().trim().min(10).max(2000),
    })
    .strict(),
]);
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    requireOrigin(req);
    const actor = await requireActor(),
      id = uuid.parse((await ctx.params).id),
      body = command.parse(await readJson(req));
    await rateLimit(`${actor.id}:resource-writes`);
    return json(
      body.action === "CANCEL"
        ? await cancelBlock(actor, id, body.reason)
        : await completeMaintenance(
            actor,
            id,
            body.version,
            body.costCentavos,
            body.note,
          ),
    );
  } catch (e) {
    return apiError(e);
  }
}
