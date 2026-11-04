import { randomUUID, createHash } from "node:crypto";
import { requireActor } from "@/lib/auth";
import { apiError, json, requireOrigin, boundedBody, readJson, uuid, versionSchema } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { validateEvidence } from "@/lib/evidence-validation";
import { storeFile, removeOrphan } from "@/lib/storage";
import { storageDriver } from "@/lib/storage-config";
import { DomainError } from "@/modules/partners/workflow";
import { purposeSchema, expirySchema } from "@/modules/bookings/requirements-schema";
import { getRequirements, changeRequirements, authorizeRequirementUpload, attachRequirementFile } from "@/modules/bookings/requirements";
type Context = {
  params: Promise<{
    id: string;
  }>;
};
export async function GET(_: Request, ctx: Context) {
  try {
    return json(await getRequirements(await requireActor(), (await ctx.params).id));
  }
  catch (e) {
    return apiError(e);
  }
}
export async function PATCH(req: Request, ctx: Context) {
  try {
    requireOrigin(req);
    const actor = await requireActor();
    await rateLimit(`${actor.id}:booking-requirements`, 40);
    return json(await changeRequirements(actor, (await ctx.params).id, await readJson(req)));
  }
  catch (e) {
    return apiError(e);
  }
}
export async function POST(req: Request, ctx: Context) {
  let orphan: string | undefined;
  try {
    requireOrigin(req);
    const actor = await requireActor(), id = uuid.parse((await ctx.params).id);
    await rateLimit(`${actor.id}:uploads`, 10);
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.startsWith("multipart/form-data;"))
      throw new DomainError("Send a multipart upload.", 415);
    const body = await boundedBody(req, 9 * 1024 * 1024);
    let form: FormData;
    try {
      form = await new Response(body, {
        headers: {
          "content-type": contentType
        }
      }).formData();
    }
    catch {
      throw new DomainError("Invalid upload form. Choose the file again.");
    }
    const file = form.get("file"), purpose = purposeSchema.parse(form.get("purpose")), version = versionSchema.parse(Number(form.get("version"))), rawExpiry = form.get("expiresOn"), expiresOn = rawExpiry ? expirySchema.parse(rawExpiry) : null;
    if (!(file instanceof File))
      throw new DomainError("Choose a file to upload.");
    const bytes = Buffer.from(await file.arrayBuffer()), mime = validateEvidence(bytes, file.type, purpose), backend = storageDriver(process.env.STORAGE_DRIVER);
    await authorizeRequirementUpload(actor, id, version);
    const fileId = randomUUID(), key = `${id}/${fileId}`;
    await storeFile(key, bytes, mime);
    orphan = key;
    const saved = await attachRequirementFile(actor, id, version, {
      id: fileId, purpose, name: file.name.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 160) || "booking-document", mime, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), backend, expiresOn
    });
    orphan = undefined;
    return json(saved, 201);
  }
  catch (e) {
    if (orphan)
      await removeOrphan(orphan).catch(() => {
      });
    return apiError(e);
  }
}
