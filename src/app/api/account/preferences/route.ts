import { requireActor } from "@/lib/auth";
import { apiError, json, readJson, requireOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { accountPreferencesCommand, saveAccountPreferences } from "@/modules/account/preferences";

export async function PATCH(req: Request) {
  try {
    requireOrigin(req);
    const actor = await requireActor();
    await rateLimit(`${actor.id}:account-preferences`, 12);
    const input = accountPreferencesCommand.parse(await readJson(req));
    await saveAccountPreferences(actor, input);
    return json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
