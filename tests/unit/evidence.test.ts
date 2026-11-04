import { it, expect } from "vitest";
import { validateEvidence } from "../../src/lib/evidence-validation";
it("accepts a matching signature and denies disguised content, empty and oversized uploads", () => {
  expect(
    validateEvidence(
      Buffer.from("%PDF-1.7\nexample"),
      "application/pdf",
      "REGISTRATION",
    ),
  ).toBe("application/pdf");
  expect(() =>
    validateEvidence(
      Buffer.from("<script>alert(1)</script>"),
      "image/png",
      "REGISTRATION",
    ),
  ).toThrow(/match/i);
  expect(() =>
    validateEvidence(Buffer.alloc(0), "application/pdf", "REGISTRATION"),
  ).toThrow(/size/i);
  expect(() =>
    validateEvidence(Buffer.alloc(8388609), "application/pdf", "REGISTRATION"),
  ).toThrow(/size/i);
  expect(() =>
    validateEvidence(Buffer.from("%PDF-1.7"), "application/pdf", "GCASH_QR"),
  ).toThrow(/image/i);
});

it("requires an image for a public vehicle photo", () => {
  expect(() =>
    validateEvidence(Buffer.from("%PDF-1.7"), "application/pdf", "PHOTO"),
  ).toThrow();
});
