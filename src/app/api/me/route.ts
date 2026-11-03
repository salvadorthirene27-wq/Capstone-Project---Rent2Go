import { requireActor } from "@/lib/auth";
import { apiError, json } from "@/lib/http";
export async function GET() {
  try {
    return json(await requireActor());
  } catch (e) {
    return apiError(e);
  }
}
