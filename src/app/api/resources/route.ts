import { requireActor } from "@/lib/auth";
import { apiError, json } from "@/lib/http";
import { listResources } from "@/modules/resources/service";
export async function GET(req: Request) {
  try {
    return json(
      await listResources(
        await requireActor(),
        Object.fromEntries(new URL(req.url).searchParams),
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}
