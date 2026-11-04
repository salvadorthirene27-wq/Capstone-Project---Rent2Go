import { apiError, json } from "@/lib/http";
import { publicTour } from "@/modules/tours/service";
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    return json(
      await publicTour(
        (await ctx.params).id,
        Object.fromEntries(new URL(req.url).searchParams),
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}
