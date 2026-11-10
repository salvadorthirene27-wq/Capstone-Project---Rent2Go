import { randomUUID } from "node:crypto";
import { requireActor } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { apiError, boundedBody, json, requireOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { normalizeProfilePhoto, profilePhotoUploadLimit } from "@/modules/account/photo-image";
import { storedActor } from "@/modules/partners/service";
import { DomainError } from "@/modules/partners/workflow";

export async function GET() {
  try {
    const actor = await requireActor();
    const image = await transaction(async client => {
      await storedActor(actor, client);
      return (await client.query<{ image: Buffer }>("SELECT image FROM account_photo WHERE actor_id=$1", [actor.id])).rows[0]?.image;
    });
    if (!image) throw new DomainError("No profile photo saved.", 404);
    return new Response(new Uint8Array(image), { headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    } });
  } catch (error) { return apiError(error); }
}

export async function PUT(request: Request) {
  try {
    requireOrigin(request);
    const actor = await requireActor();
    await rateLimit(`${actor.id}:profile-photo-write`, 8);
    const image = await normalizeProfilePhoto(await boundedBody(request, profilePhotoUploadLimit), request.headers.get("content-type") ?? "");
    const revision = randomUUID();
    await transaction(async client => {
      await client.query("SELECT id FROM app_actor WHERE id=$1 FOR UPDATE", [actor.id]);
      await storedActor(actor, client);
      await client.query(`INSERT INTO account_photo(actor_id,revision,image)
        VALUES($1,$2,$3) ON CONFLICT(actor_id) DO UPDATE SET revision=excluded.revision,image=excluded.image`,
        [actor.id, revision, image]);
    });
    return json({ revision });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try {
    requireOrigin(request);
    const actor = await requireActor();
    await rateLimit(`${actor.id}:profile-photo-write`, 8);
    await transaction(async client => {
      await client.query("SELECT id FROM app_actor WHERE id=$1 FOR UPDATE", [actor.id]);
      await storedActor(actor, client);
      await client.query("DELETE FROM account_photo WHERE actor_id=$1", [actor.id]);
    });
    return json({ revision: null });
  } catch (error) { return apiError(error); }
}
