import { requireActor } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { loadFile } from "@/lib/storage";
import { bookingFileForRead } from "@/modules/bookings/requirements";
export async function GET(_: Request, ctx: {
  params: Promise<{
    id: string;
  }>;
}) {
  try {
    const actor = await requireActor();
    const file = await bookingFileForRead(actor, (await ctx.params).id);
    const bytes = await loadFile(file.objectKey, file.backend);
    return new Response(bytes, {
      headers: {
        "Content-Type": file.mime, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox"
      }
    });
  }
  catch (e) {
    return apiError(e);
  }
}
