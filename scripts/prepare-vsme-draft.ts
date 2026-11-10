import { z } from "zod";
import { vsmeApplicationDraft } from "../src/modules/partners/presets/vsme";

const email = z.email().parse(process.argv[2]?.trim().toLowerCase());
if (!process.env.DATABASE_URL || process.env.NEON_PROJECT_ID !== "floral-flower-08375841")
  throw Error("An explicitly configured Rent2Go database is required.");
const target = new URL(process.env.DATABASE_URL);
if (target.pathname !== "/rent2go" || target.username !== "rent2go_app" || !target.hostname.startsWith("ep-dawn-rain-aowtcdg5"))
  throw Error("Unexpected database. This script only prepares the isolated preview.");
target.pathname = "/rent2go_test";
process.env.DATABASE_URL = target.toString();

const { db } = await import("../src/lib/db");
const { createApplication, myApplication, saveDraft } = await import("../src/modules/partners/service");
const { DomainError } = await import("../src/modules/partners/workflow");
try {
  const matches = await db.query<{id:string;role:"RENTER"|"AGENCY_ADMIN";name:string}>(
    "SELECT id,role,name FROM app_actor WHERE lower(email)=$1 AND NOT suspended AND role IN ('RENTER','AGENCY_ADMIN')", [email],
  );
  if (matches.rowCount !== 1) throw new DomainError("Sign in as the authorized VSME account in the isolated preview first.");
  const actor = matches.rows[0];
  const existing = await myApplication(actor);
  if (existing && (existing.status !== "DRAFT" || existing.payload.businessName && existing.payload.businessName !== "VSME Travel and Tours"))
    throw new DomainError("This account already owns a different application or a submitted application.");
  if (existing?.payload.businessName && (existing.payload.nonConsignedShares || existing.version !== 2)) {
    console.log("VSME draft already exists. Saved operator changes were preserved.");
  } else {
    const draft = existing ?? await createApplication(actor);
    const preset = vsmeApplicationDraft(email);
    const payload = existing?.payload.businessName ? {
      ...existing.payload,
      nonConsignedShares: preset.nonConsignedShares,
      minimumTourHours: preset.minimumTourHours,
      renterIdsAtHandover: preset.renterIdsAtHandover,
    } : preset;
    const saved = await saveDraft(actor, draft.id, payload, draft.version);
    console.log(`Prepared VSME agency draft ${saved.id} (version ${saved.version}) in the isolated preview.`);
  }
} catch (error) {
  console.error(error instanceof DomainError ? error.message : "Could not prepare the VSME draft.");
  process.exitCode = 1;
} finally { await db.end(); }
