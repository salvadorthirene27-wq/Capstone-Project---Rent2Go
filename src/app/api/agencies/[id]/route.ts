import { apiError, json } from "@/lib/http";
import { publicAgency } from "@/modules/agencies/service";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return json(await publicAgency((await params).id));
  } catch (e) {
    return apiError(e);
  }
}
