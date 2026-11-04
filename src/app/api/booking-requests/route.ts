import { requireActor } from "@/lib/auth";
import { apiError, json, readJson, requireOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import {
  submitBookingRequests,
  listBookingRequests,
} from "@/modules/bookings/service";
export async function GET(req: Request) {
  try {
    return json(
      await listBookingRequests(
        await requireActor(),
        Object.fromEntries(new URL(req.url).searchParams),
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: Request) {
  try {
    requireOrigin(req);
    const actor = await requireActor();
    await rateLimit(`${actor.id}:booking-submissions`, 30);
    return json(await submitBookingRequests(actor, await readJson(req)), 201);
  } catch (e) {
    return apiError(e);
  }
}
