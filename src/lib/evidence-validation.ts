import { DomainError } from "../modules/partners/workflow";
export function validateEvidence(
  bytes: Uint8Array,
  declared: string,
  purpose: string,
) {
  if (!bytes.length || bytes.length > 8388608)
    throw new DomainError("File size must be between 1 byte and 8 MB.", 413);
  const b = Buffer.from(bytes);
  const actual =
    b.subarray(0, 5).toString() === "%PDF-"
      ? "application/pdf"
      : b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? "image/png"
        : b[0] === 255 && b[1] === 216 && b[2] === 255
          ? "image/jpeg"
          : null;
  if (!actual || actual !== declared)
    throw new DomainError(
      "The file content does not match a supported PDF, PNG or JPEG.",
    );
  if (purpose === "GCASH_QR" && actual === "application/pdf")
    throw new DomainError("Upload a PNG or JPEG image for the GCash QR.");
  return actual;
}
