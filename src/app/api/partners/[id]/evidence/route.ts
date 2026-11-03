import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { requireActor } from "@/lib/auth";
import {
  apiError,
  json,
  requireOrigin,
  boundedBody,
  uuid,
  versionSchema,
} from "@/lib/http";
import { transaction } from "@/lib/db";
import { storedActor, audit } from "@/modules/partners/service";
import { authorizeTransition, DomainError } from "@/modules/partners/workflow";
import { validateEvidence } from "@/lib/evidence-validation";
import { storeFile, removeOrphan } from "@/lib/storage";
import { rateLimit } from "@/lib/rate-limit";
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  let orphan: string | undefined;
  try {
    requireOrigin(req);
    const actor = await requireActor(),
      id = uuid.parse((await ctx.params).id);
    await rateLimit(`${actor.id}:uploads`, 10);
    const bytes = await boundedBody(req, 9 * 1024 * 1024);
    const form = await new Response(bytes, {
      headers: { "content-type": req.headers.get("content-type") ?? "" },
    }).formData();
    const file = form.get("file"),
      purpose = z
        .enum(["REGISTRATION", "PERMIT", "GCASH_QR"])
        .parse(form.get("purpose"));
    const version = versionSchema.parse(Number(form.get("version")));
    if (!(file instanceof File))
      throw new DomainError("Choose a document to upload.");
    const content = Buffer.from(await file.arrayBuffer()),
      mime = validateEvidence(content, file.type, purpose),
      fileId = randomUUID(),
      key = `${id}/${fileId}`;
    // Authorize before storage I/O; the transaction below rechecks state/version.
    const { getApplication } = await import("@/modules/partners/service");
    const before = await getApplication(actor, id);
    authorizeTransition(actor, before, "SAVE", version);
    await storeFile(key, content, mime);
    orphan = key;
    await transaction(async (c) => {
      const user = await storedActor(actor, c),
        row = (
          await c.query(
            "SELECT owner_id,status,version FROM partner_application WHERE id=$1 FOR UPDATE",
            [id],
          )
        ).rows[0];
      authorizeTransition(
        user,
        { ownerId: row.owner_id, status: row.status, version: row.version },
        "SAVE",
        version,
      );
      const name =
        file.name.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 160) || "document";
      await c.query(
        "UPDATE private_file SET is_current=false WHERE application_id=$1 AND purpose=$2 AND is_current",
        [id, purpose],
      );
      await c.query(
        "INSERT INTO private_file(id,application_id,owner_id,purpose,object_key,original_name,mime,size_bytes,sha256,storage_driver) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          fileId,
          id,
          user.id,
          purpose,
          key,
          name,
          mime,
          content.length,
          createHash("sha256").update(content).digest("hex"),
          process.env.STORAGE_DRIVER,
        ],
      );
      await c.query(
        "UPDATE partner_application SET version=version+1,updated_at=now() WHERE id=$1",
        [id],
      );
      await audit(c, user, "APPLICATION_EVIDENCE_UPLOADED", id, {
        fileId,
        purpose,
      });
    });
    orphan = undefined;
    return json({ id: fileId, version: version + 1 }, 201);
  } catch (e) {
    if (orphan) await removeOrphan(orphan).catch(() => {});
    return apiError(e);
  }
}
