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
import { rateLimit } from "@/lib/rate-limit";
import { validateEvidence } from "@/lib/evidence-validation";
import { storeFile, removeOrphan } from "@/lib/storage";
import { storageDriver } from "@/lib/storage-config";
import {
  authorizeVehicleUpload,
  attachVehicleFile,
} from "@/modules/vehicles/service";
import { DomainError } from "@/modules/partners/workflow";
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
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.startsWith("multipart/form-data;"))
      throw new DomainError("Send a multipart upload.", 415);
    const body = await boundedBody(req, 9 * 1024 * 1024);
    let form: FormData;
    try {
      form = await new Response(body, {
        headers: { "content-type": contentType },
      }).formData();
    } catch {
      throw new DomainError("Invalid upload form. Choose the file again.");
    }
    const file = form.get("file"),
      purpose = z.enum(["OWNERSHIP", "PHOTO"]).parse(form.get("purpose")),
      version = versionSchema.parse(Number(form.get("version")));
    if (!(file instanceof File))
      throw new DomainError("Choose a file to upload.");
    const bytes = Buffer.from(await file.arrayBuffer()),
      mime = validateEvidence(bytes, file.type, purpose),
      backend = storageDriver(process.env.STORAGE_DRIVER),
      before = await authorizeVehicleUpload(actor, id, version),
      fileId = randomUUID(),
      key = `${before.vehicleId}/${fileId}`;
    await storeFile(key, bytes, mime);
    orphan = key;
    const saved = await attachVehicleFile(actor, id, version, {
      id: fileId,
      purpose,
      name:
        file.name.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 160) ||
        "vehicle-file",
      mime,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      backend,
    });
    orphan = undefined;
    return json(saved, 201);
  } catch (e) {
    if (orphan) await removeOrphan(orphan).catch(() => {});
    return apiError(e);
  }
}
