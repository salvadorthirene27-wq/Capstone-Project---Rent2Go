import { createHash } from "node:crypto";
import type { Selection } from "./schema";
export type CartQuote = {
  digest: string;
  selection: Selection;
  agencyId: string;
  agencyName: string;
  policyRevision: number;
  sourceRevision: number;
  title: string;
  photoId: string | null;
  startAt: string;
  endAt: string;
  priceUnit: string;
  constraints: {
    minParty: number;
    maxParty: number;
    modes?: ("SELF_DRIVE" | "WITH_DRIVER")[];
  };
  estimate: {
    serviceCentavos: number;
    refundableDepositCentavos: number;
    estimatedDueCentavos: number;
    rentalUnits?: number;
    driverUnits?: number;
    vehicleCentavos?: number;
    driverCentavos?: number;
  };
};
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export function digest(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
export function fingerprint(s: Selection) {
  return digest(
    s.kind === "RENTAL"
      ? [s.kind, s.offerId, s.startAt, s.endAt, s.mode]
      : [s.kind, s.tourId, s.scheduleId],
  );
}
