import { apiError, json } from "@/lib/http";
import { publicTour } from "@/modules/tours/service";
export async function GET(
  _: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    return json(await publicTour((await ctx.params).id));
  } catch (e) {
    return apiError(e);
  }
}
