import { requireActor } from "@/lib/auth";
import { apiError, uuid } from "@/lib/http";
import { db, transaction } from "@/lib/db";
import { DomainError } from "@/modules/partners/workflow";
import { audit } from "@/modules/partners/service";
import { loadFile } from "@/lib/storage";
export async function GET(
  _: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor(),
      id = uuid.parse((await ctx.params).id);
    const f = (
      await db.query(
        "SELECT * FROM private_file WHERE id=$1 AND (owner_id=$2 OR $3::boolean)",
        [id, actor.id, actor.role === "SUPER_ADMIN"],
      )
    ).rows[0];
    if (!f) throw new DomainError("Document not found.", 404);
    const bytes = await loadFile(f.object_key, f.storage_driver);
    await transaction((c) =>
      audit(c, actor, "APPLICATION_EVIDENCE_DOWNLOADED", f.application_id, {
        fileId: id,
      }),
    );
    return new Response(bytes, {
      headers: {
        "Content-Type": f.mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.original_name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
