import { requireActor } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { loadFile } from "@/lib/storage";
import { vehicleFileForRead } from "@/modules/vehicles/service";
import { DomainError } from "@/modules/partners/workflow";
export async function GET(
  _: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const id = (await ctx.params).id;
    let file;
    try {
      file = await vehicleFileForRead(null, id);
    } catch (e) {
      if (!(e instanceof DomainError) || e.status !== 404) throw e;
      file = await vehicleFileForRead(await requireActor(), id);
    }
    const bytes = await loadFile(file.objectKey, file.backend);
    return new Response(bytes, {
      headers: {
        "Content-Type": file.mime,
        "Content-Disposition": `${file.mime.startsWith("image/") ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
