import { requireActor } from "@/lib/auth";
import { apiError, json, uuid } from "@/lib/http";
import { resourceAvailability } from "@/modules/resources/service";
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    return json(
      await resourceAvailability(
        await requireActor(),
        uuid.parse((await ctx.params).id),
        Object.fromEntries(new URL(req.url).searchParams),
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}
