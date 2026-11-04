import { apiError, json } from "@/lib/http";
import { publicAgencies } from "@/modules/agencies/service";
export async function GET(req: Request) {
  try {
    return json(
      await publicAgencies(Object.fromEntries(new URL(req.url).searchParams)),
    );
  } catch (e) {
    return apiError(e);
  }
}
