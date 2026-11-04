import { requireActor } from "@/lib/auth";
import { apiError, json } from "@/lib/http";
import { getBookingRequest } from "@/modules/bookings/service";
export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return json(
      await getBookingRequest(await requireActor(), (await context.params).id),
    );
  } catch (e) {
    return apiError(e);
  }
}
