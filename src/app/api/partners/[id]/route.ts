import { z } from "zod";
import { requireActor } from "@/lib/auth";
import {
  apiError,
  json,
  requireOrigin,
  readJson,
  uuid,
  versionSchema,
} from "@/lib/http";
import {
  getApplication,
  saveDraft,
  submitApplication,
  reviewApplication,
  withdrawApplication,
  startPolicyRevision,
} from "@/modules/partners/service";
import { rateLimit } from "@/lib/rate-limit";
const command = z
  .object({
    action: z.enum([
      "SAVE",
      "SUBMIT",
      "WITHDRAW",
      "AMEND",
      "START_REVIEW",
      "APPROVE",
      "CHANGES_REQUESTED",
      "REJECT",
    ]),
    version: versionSchema,
    payload: z.unknown().optional(),
    reason: z.string().trim().max(4000).optional(),
  })
  .strict();
type Context = { params: Promise<{ id: string }> };
export async function GET(_: Request, ctx: Context) {
  try {
    return json(
      await getApplication(
        await requireActor(),
        uuid.parse((await ctx.params).id),
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(req: Request, ctx: Context) {
  try {
    requireOrigin(req);
    const actor = await requireActor(),
      id = uuid.parse((await ctx.params).id),
      body = command.parse(await readJson(req));
    await rateLimit(`${actor.id}:partner-writes`);
    if (body.action === "SAVE")
      return json(await saveDraft(actor, id, body.payload, body.version));
    if (body.action === "SUBMIT")
      return json(await submitApplication(actor, id, body.version));
    if (body.action === "WITHDRAW")
      return json(await withdrawApplication(actor, id, body.version));
    if (body.action === "AMEND")
      return json(await startPolicyRevision(actor, id, body.version));
    return json(
      await reviewApplication(
        actor,
        id,
        body.version,
        body.action,
        body.reason ?? "",
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}
