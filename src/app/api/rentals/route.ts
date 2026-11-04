import { apiError, json } from "@/lib/http";
import { searchVehicles } from "@/modules/marketplace/vehicles";
export async function GET(req: Request) {
  try {
    return json(
      await searchVehicles(Object.fromEntries(new URL(req.url).searchParams)),
    );
  } catch (error) {
    return apiError(error);
  }
}
