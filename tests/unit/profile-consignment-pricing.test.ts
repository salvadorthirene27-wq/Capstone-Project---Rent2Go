import { expect, it } from "vitest";
import { requiredVehicleEvidence } from "../../src/modules/vehicles/workflow";
import { rentalEstimate } from "../../src/modules/pricing/rental";
import { normalizeProfilePhoto } from "../../src/modules/account/photo-image";
import sharp from "sharp";

it("requires registration and driver license for cosigners without requiring a listing photo", () => {
  expect(requiredVehicleEvidence("CONSIGNED", ["OWNERSHIP", "DRIVER_LICENSE"])).toEqual([]);
  expect(requiredVehicleEvidence("CONSIGNED", ["OWNERSHIP", "PHOTO"])).toEqual(["DRIVER_LICENSE"]);
  expect(requiredVehicleEvidence("AGENCY_OWNED", ["OWNERSHIP"])).toEqual(["PHOTO"]);
});

it("requires at least twelve hours for block rentals and bills a full second block after twelve hours", () => {
  const terms = { billingUnit: "12_HOUR", rateCentavos: 250000, depositCentavos: 500000, driverFeeCentavos: 0, modes: ["SELF_DRIVE"] };
  const start = "2030-01-01T00:00:00Z";
  expect(() => rentalEstimate(terms, start, "2030-01-01T11:59:00Z", "SELF_DRIVE")).toThrow(/at least 12 hours/i);
  expect(rentalEstimate(terms, start, "2030-01-01T12:00:00Z", "SELF_DRIVE").vehicleCentavos).toBe(250000);
  expect(rentalEstimate(terms, start, "2030-01-01T12:01:00Z", "SELF_DRIVE").vehicleCentavos).toBe(500000);
});

it("decodes and resizes a real profile image and rejects an invalid image with a JPEG header", async () => {
  const original = await sharp({create:{width:700,height:400,channels:3,background:"#2f5d50"}}).jpeg().toBuffer();
  const safe = await normalizeProfilePhoto(original, "image/jpeg");
  expect(await sharp(safe).metadata()).toMatchObject({format:"webp",width:512,height:512});
  await expect(normalizeProfilePhoto(Buffer.from([255,216,255,1,2,3]), "image/jpeg")).rejects.toThrow(/photo/i);
});
