import { manilaInputToIso } from "../../lib/manila-time";
import { vehicleSearchSchema } from "./schema";
export type RawFilters = Record<string, string | string[] | undefined>;
export function rentalFilters(raw: RawFilters) {
  try {
    const input: Record<string, unknown> = {};
    for (const key of [
      "agencyId",
      "search",
      "serviceArea",
      "mode",
      "partySize",
      "transmission",
      "preferredTransmission",
      "fuel",
      "bodyType",
      "billingUnit",
      "maxRateCentavos",
      "budgetCentavos",
      "sort",
      "page",
      "startAt",
      "endAt",
    ]) {
      if (raw[key] !== undefined && raw[key] !== "") input[key] = raw[key];
    }
    for (const [field, key] of [
      ["startLocal", "startAt"],
      ["endLocal", "endAt"],
    ])
      if (raw[field]) {
        if (typeof raw[field] !== "string")
          throw Error("Choose a single pickup and return time.");
        input[key] = manilaInputToIso(raw[field] as string);
      }
    for (const [field, key] of [
      ["maxRatePHP", "maxRateCentavos"],
      ["budgetPHP", "budgetCentavos"],
    ])
      if (raw[field]) {
        if (typeof raw[field] !== "string")
          throw Error("Enter a valid amount.");
        input[key] = Math.round(Number(raw[field]) * 100);
      }
    const parsed = vehicleSearchSchema.safeParse(input);
    if (!parsed.success)
      return {
        query: vehicleSearchSchema.parse({}),
        error: parsed.error.issues[0]?.message ?? "Check your filters.",
      };
    return { query: parsed.data, error: null };
  } catch (error) {
    return {
      query: vehicleSearchSchema.parse({}),
      error:
        error instanceof Error
          ? error.message
          : "Check the pickup and return times.",
    };
  }
}
export function queryString(input: Record<string, unknown>) {
  return new URLSearchParams(
    Object.entries(input)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => [k, String(v)]),
  ).toString();
}
export function localInput(value?: string) {
  return value
    ? new Date(Date.parse(value) + 28800000).toISOString().slice(0, 16)
    : "";
}
