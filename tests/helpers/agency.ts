import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import {
  createApplication,
  saveDraft,
  submitApplication,
  reviewApplication,
} from "../../src/modules/partners/service";
import {
  defaultApplication,
  type ApplicationInput,
} from "../../src/modules/partners/schema";
import type { Actor } from "../../src/modules/partners/workflow";
export async function approvedAgency(
  owner: Actor,
  reviewer: Actor,
  overrides: Partial<ApplicationInput> = {},
) {
  const app = await createApplication(owner);
  const payload: ApplicationInput = {
    ...defaultApplication,
    businessName: `Synthetic agency ${randomUUID().slice(0, 8)}`,
    legalName: "Synthetic company",
    representative: "Synthetic representative",
    email: "demo@example.test",
    phone: "+639171234567",
    address: "Synthetic office",
    serviceAreas: "Albay",
    registrationNumber: "DEMO-ONLY",
    supportContact: "help@example.test",
    services: ["SELF_DRIVE"],
    eligibilityTerms: "Identity and license review.",
    terms: "Accepted quotation and agreement.",
    cancellationPolicy: "Review before release.",
    refundPolicy: "Separate refund review.",
    damagePolicy: "Documented condition inspections.",
    latePolicy: "Itemized accepted charges.",
    inclusions: "Vehicle service",
    exclusions: "Fuel",
    dailyRateCentavos: 200000,
    depositCentavos: 300000,
    holdHours: 24,
    bufferMinutes: 30,
    acceptedMethods: ["CASH"],
    consent: true,
    ...overrides,
  };
  await saveDraft(owner, app.id, payload, 1);
  await db.query(
    "INSERT INTO private_file(id,application_id,owner_id,purpose,object_key,original_name,mime,size_bytes,sha256) VALUES($1,$2,$3,'REGISTRATION',$4,'synthetic.pdf','application/pdf',10,'test')",
    [randomUUID(), app.id, owner.id, `fixture/${randomUUID()}`],
  );
  await submitApplication(owner, app.id, 2);
  await reviewApplication(
    reviewer,
    app.id,
    3,
    "APPROVE",
    "Synthetic complete evidence independently reviewed.",
  );
  return (
    await db.query("SELECT id FROM agency WHERE application_id=$1", [app.id])
  ).rows[0].id as string;
}
