import { apiError, json } from "@/lib/http";
import { publicTours } from "@/modules/tours/service";
export async function GET(req: Request) {
  try {
    return json(
      await publicTours(Object.fromEntries(new URL(req.url).searchParams)),
    );
  } catch (e) {
    return apiError(e);
  }
}
