import { z } from "zod";
import { requireActor } from "@/lib/auth";
import { apiError, json, readJson, requireOrigin, uuid } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { createTour, listTours } from "@/modules/tours/service";
export async function GET(req: Request) {
  try {
    const actor = await requireActor(),
      q = z
        .object({
          agencyId: uuid,
          page: z.coerce.number().int().min(1).max(10000).default(1),
        })
        .strict()
        .parse(Object.fromEntries(new URL(req.url).searchParams));
    return json(await listTours(actor, q.agencyId, q.page));
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: Request) {
  try {
    requireOrigin(req);
    const actor = await requireActor();
    await rateLimit(`${actor.id}:tour-writes`);
    return json(await createTour(actor, await readJson(req)), 201);
  } catch (e) {
    return apiError(e);
  }
}
