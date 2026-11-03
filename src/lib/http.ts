import { randomUUID } from "node:crypto";
import { ZodError, z } from "zod";
import { DomainError } from "../modules/partners/workflow";
export const uuid = z.uuid();
export const versionSchema = z.number().int().positive();
export function requireOrigin(request: Request) {
  if (request.headers.get("origin") !== process.env.APP_ORIGIN)
    throw new DomainError("This request origin is not allowed.", 403);
}
export async function boundedBody(request: Request, max = 100000) {
  if (Number(request.headers.get("content-length")) > max)
    throw new DomainError("The upload is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new DomainError("The upload is too large.", 413);
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}
export async function readJson(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new DomainError("Send a JSON request.", 415);
  try {
    return JSON.parse(new TextDecoder().decode(await boundedBody(request)));
  } catch (e) {
    if (e instanceof DomainError) throw e;
    throw new DomainError("Invalid JSON request.");
  }
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export function apiError(error: unknown) {
  if (error instanceof ZodError)
    return json(
      { error: "Check the highlighted fields.", issues: error.issues },
      422,
    );
  if (error instanceof DomainError)
    return json({ error: error.message }, error.status);
  const incident = randomUUID();
  console.error("Rent2Go request failed", {
    incident,
    type: error instanceof Error ? error.name : "unknown",
  });
  return json(
    {
      error: `Unable to finish this request. Try again. Reference: ${incident}`,
    },
    500,
  );
}
