import {assertNoPendingCancellation,cancellationPending} from "./cancellation-guard";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { transaction } from "../../lib/db";
import { uuid, versionSchema } from "../../lib/http";
import { storedActor, audit } from "../partners/service";
import { DomainError, type Actor } from "../partners/workflow";
import { serviceEndDate, requiredPurposes, requirementsCommand, purposeSchema, expirySchema, validateExpiry, type Purpose } from "./requirements-schema";
type RequestRow = {
  id: string;
  renter_id: string;
  agency_id: string;
  status: string;
  version: number;
};
const editable = (r: RequestRow) => ["REQUIREMENTS_PENDING", "CHANGES_REQUESTED"].includes(r.status);
async function context(c: PoolClient, actor: Actor, id: string, lock = false) {
  const user = await storedActor(actor, c);
  const r = (await c.query(`SELECT * FROM booking_request WHERE id=$1${lock ? " FOR UPDATE" : ""}`, [uuid.parse(id)])).rows[0] as RequestRow | undefined;
  if (!r)
    throw new DomainError("Request not found.", 404);
  const owner = r.renter_id === user.id;
  const reviewer = !owner && (await c.query("SELECT 1 FROM agency_member m JOIN agency a ON a.id=m.agency_id JOIN app_actor o ON o.id=a.owner_id WHERE m.agency_id=$1 AND m.actor_id=$2 AND m.active AND a.active AND NOT o.suspended", [r.agency_id, user.id])).rowCount !== 0;
  if (!owner && !reviewer)
    throw new DomainError("Request not found.", 404);
  const quotes = (await c.query("SELECT public_quote FROM booking_request_line WHERE request_id=$1", [id])).rows.map(v => v.public_quote);
  return {
    r, user, owner, reviewer, purposes: requiredPurposes(quotes), end: quotes.map(q => serviceEndDate(q.endAt)).sort().at(-1) ?? ""
  };
}
async function submission(c: PoolClient, id: string) {
  return (await c.query("SELECT id FROM booking_requirement_submission WHERE request_id=$1 ORDER BY version DESC LIMIT 1", [id])).rows[0]?.id as string | undefined;
}
async function projection(c: PoolClient, ctx: Awaited<ReturnType<typeof context>>) {
  const { r, owner, reviewer, purposes } = ctx, batch = await submission(c, r.id),paused=await cancellationPending(c,r.id);
  const files = (await c.query(`SELECT DISTINCT ON(f.purpose) f.*,f.expires_on::text AS expires_on,d.decision,d.reason FROM booking_requirement_file f LEFT JOIN booking_requirement_selection s ON s.file_id=f.id AND s.submission_id=$2 LEFT JOIN booking_requirement_decision d ON d.file_id=f.id AND d.submission_id=s.submission_id WHERE f.request_id=$1 ${owner && editable(r) ? "" : "AND s.submission_id=$2"} ORDER BY f.purpose,f.created_at DESC,f.id DESC`, [r.id, batch ?? null])).rows;
  return {
    requestId: r.id, requestVersion: r.version, status: r.status, cancellationPending:paused, canEdit: !paused && owner && editable(r), isReviewer: reviewer, requiredPurposes: purposes, documents: files.map(f => ({
      id: f.id, purpose: f.purpose, name: f.name, mime: f.mime, size: f.size, uploadedAt: new Date(f.created_at).toISOString(), status: f.decision ?? "PENDING", reason: f.reason ?? "", expiresOn: f.expires_on ? f.expires_on : null
    }))
  };
}
function checkVersion(r: RequestRow, version: number) {
  if (r.version !== version)
    throw new DomainError("This request changed. Reload and try again.", 409);
}
async function uploadContext(c: PoolClient, actor: Actor, id: string, version: number) {
  const ctx = await context(c, actor, id, true);
  await assertNoPendingCancellation(c,id);
  checkVersion(ctx.r, versionSchema.parse(version));
  if (!ctx.owner || !editable(ctx.r))
    throw new DomainError("Requirements cannot be edited at this stage.", 409);
  if (Number((await c.query("SELECT count(*) FROM booking_requirement_file WHERE request_id=$1", [id])).rows[0].count) >= 30)
    throw new DomainError("This request has reached the 30 document upload limit.", 409);
  return ctx;
}
export async function getRequirements(actor: Actor, id: string) {
  return transaction(async (c) => {
    await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    return projection(c, await context(c, actor, id));
  });
}
export async function authorizeRequirementUpload(actor: Actor, id: string, version: number) {
  return transaction(async (c) => {
    await uploadContext(c, actor, id, version);
    return {
      requestId: id
    };
  });
}
export type RequirementUpload = {
  id: string;
  purpose: Purpose;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  backend: string;
  expiresOn: string | null;
};
export async function attachRequirementFile(actor: Actor, id: string, version: number, file: RequirementUpload) {
  return transaction(async (c) => {
    const ctx = await uploadContext(c, actor, id, version);
    purposeSchema.parse(file.purpose);
    if (!ctx.purposes.includes(file.purpose))
      throw new DomainError("This document purpose is not required.");
    if (file.expiresOn)
      expirySchema.parse(file.expiresOn);
    await c.query("INSERT INTO booking_requirement_file(id,request_id,uploader_id,purpose,name,mime,size,sha256,backend,expires_on) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [uuid.parse(file.id), id, ctx.user.id, file.purpose, file.name, file.mime, file.size, file.sha256, file.backend, file.expiresOn]);
    await c.query("UPDATE booking_request SET version=version+1 WHERE id=$1", [id]);
    ctx.r.version++;
    await audit(c, ctx.user, "BOOKING_REQUIREMENT_UPLOADED", id, {
      fileId: file.id, purpose: file.purpose
    });
    return projection(c, ctx);
  });
}
async function event(c: PoolClient, ctx: Awaited<ReturnType<typeof context>>, action: string, message: string) {
  await c.query("INSERT INTO booking_event(id,request_id,actor_id,action,message) VALUES($1,$2,$3,$4,$5)", [randomUUID(), ctx.r.id, ctx.user.id, action, message]);
  await audit(c, ctx.user, `BOOKING_${action}`, ctx.r.id, {
    message
  });
  if (action === "SUBMIT")
    await c.query("INSERT INTO booking_notification(id,request_id,recipient_id,message) SELECT gen_random_uuid(),$1,m.actor_id,$2 FROM agency_member m JOIN app_actor a ON a.id=m.actor_id WHERE m.agency_id=$3 AND m.active AND NOT a.suspended AND m.actor_id<>$4", [ctx.r.id, message, ctx.r.agency_id, ctx.r.renter_id]);
  else if (action !== "START_REVIEW" && action !== "REVIEW_DOCUMENT")
    await c.query("INSERT INTO booking_notification(id,request_id,recipient_id,message) VALUES($1,$2,$3,$4)", [randomUUID(), ctx.r.id, ctx.r.renter_id, message]);
}
export async function changeRequirements(actor: Actor, id: string, input: unknown) {
  const command = requirementsCommand.parse(input);
  return transaction(async (c) => {
    const ctx = await context(c, actor, id, true), { r } = ctx;
    await assertNoPendingCancellation(c,id);
    checkVersion(r, command.version);
    let next = r.status, message = "Review started.";
    if (command.action === "SUBMIT") {
      if (!ctx.owner || !editable(r))
        throw new DomainError("Requirements cannot be submitted at this stage.", 409);
      const files = (await c.query("SELECT DISTINCT ON(purpose) * FROM booking_requirement_file WHERE request_id=$1 ORDER BY purpose,created_at DESC,id DESC", [id])).rows;
      if (ctx.purposes.some(p => !files.some(f => f.purpose === p)))
        throw new DomainError("Upload every required document before submitting.", 409);
      const batch = randomUUID();
      await c.query("INSERT INTO booking_requirement_submission(id,request_id,version,actor_id) VALUES($1,$2,$3,$4)", [batch, id, r.version + 1, ctx.user.id]);
      for (const p of ctx.purposes) {
        const f = files.find(f => f.purpose === p)!;
        await c.query("INSERT INTO booking_requirement_selection(submission_id,request_id,purpose,file_id) VALUES($1,$2,$3,$4)", [batch, id, p, f.id]);
      }
      next = "UNDER_REVIEW";
      message = "Requirements submitted for human review.";
    }
    else {
      if (!ctx.reviewer)
        throw new DomainError("Only the agency reviewer can review requirements.", 403);
      if (r.status !== "UNDER_REVIEW")
        throw new DomainError("This request is not under review.", 409);
      const batch = await submission(c, id);
      if (command.action === "REVIEW_DOCUMENT") {
        const f = (await c.query("SELECT f.*,f.expires_on::text AS expires_on FROM booking_requirement_selection s JOIN booking_requirement_file f ON f.id=s.file_id WHERE s.submission_id=$1 AND s.file_id=$2", [batch, command.fileId])).rows[0];
        if (!f)
          throw new DomainError("Submitted document not found.", 404);
        if (command.decision === "ACCEPTED")
          validateExpiry(f.purpose, f.expires_on ? f.expires_on : null, ctx.end);
        if ((await c.query("SELECT 1 FROM booking_requirement_decision WHERE submission_id=$1 AND file_id=$2", [batch, f.id])).rowCount)
          throw new DomainError("This document already has an immutable review decision.", 409);
        await c.query("INSERT INTO booking_requirement_decision(id,submission_id,file_id,reviewer_id,decision,reason) VALUES($1,$2,$3,$4,$5,$6)", [randomUUID(), batch, f.id, ctx.user.id, command.decision, command.reason ?? ""]);
        message = command.reason || "Document accepted.";
      }
      else if (command.action === "COMPLETE_REVIEW") {
        const decisions = (await c.query("SELECT s.purpose,d.decision FROM booking_requirement_selection s LEFT JOIN booking_requirement_decision d ON d.submission_id=s.submission_id AND d.file_id=s.file_id WHERE s.submission_id=$1", [batch])).rows;
        if (ctx.purposes.some(p => !decisions.some(d => d.purpose === p && d.decision)))
          throw new DomainError("Review every required document first.", 409);
        next = decisions.every(d => d.decision === "ACCEPTED") ? "READY_FOR_APPROVAL" : "CHANGES_REQUESTED";
        message = next === "READY_FOR_APPROVAL" ? "Requirements accepted; ready for approval." : "Document corrections requested. Review the reasons and submit revised requirements.";
      }
      else if (command.action === "REJECT") {
        next = "REJECTED";
        message = command.reason;
      }
    }
    await c.query("UPDATE booking_request SET version=version+1,status=$2 WHERE id=$1", [id, next]);
    r.version++;
    r.status = next;
    await event(c, ctx, command.action, message);
    return projection(c, ctx);
  });
}
export async function bookingFileForRead(actor: Actor, id: string) {
  return transaction(async (c) => {
    await storedActor(actor, c);
    const file = (await c.query("SELECT * FROM booking_requirement_file WHERE id=$1", [uuid.parse(id)])).rows[0];
    if (!file)
      throw new DomainError("File not found.", 404);
    const ctx = await context(c, actor, file.request_id);
    if (!ctx.owner && !(await c.query("SELECT 1 FROM booking_requirement_selection WHERE file_id=$1", [id])).rowCount)
      throw new DomainError("File not found.", 404);
    return {
      objectKey: `${file.request_id}/${file.id}`, backend: file.backend, mime: file.mime, name: file.name
    };
  });
}
