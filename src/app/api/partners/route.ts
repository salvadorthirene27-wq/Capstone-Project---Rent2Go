import { requireActor } from "@/lib/auth";
import { apiError, json, requireOrigin } from "@/lib/http";
import {
  createApplication,
  listApplications,
} from "@/modules/partners/service";
import { rateLimit } from "@/lib/rate-limit";
export async function GET() {
  try {
    return json(await listApplications(await requireActor()));
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: Request) {
  try {
    requireOrigin(req);
    const actor = await requireActor();
    await rateLimit(`${actor.id}:partner-writes`);
    return json(await createApplication(actor), 201);
  } catch (e) {
    return apiError(e);
  }
}
