import sharp from "sharp";
import { DomainError } from "../partners/workflow";

export const profilePhotoUploadLimit = 5 * 1024 * 1024;
const supportedFormats: Readonly<Record<string, string>> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function normalizeProfilePhoto(input: Uint8Array, mime: string) {
  if (!input.length || input.length > profilePhotoUploadLimit)
    throw new DomainError("Choose a profile photo no larger than 5 MB.", 413);
  if (!Object.hasOwn(supportedFormats, mime))
    throw new DomainError("Choose a JPEG, PNG or WebP profile photo.", 422);
  try {
    const image = sharp(input, { limitInputPixels: 16_000_000, failOn: "warning" });
    const metadata = await image.metadata();
    if (metadata.format !== supportedFormats[mime] || (metadata.pages ?? 1) !== 1)
      throw new Error("Unexpected image format");
    return await image.rotate().resize(512, 512, { fit: "cover" }).webp({ quality: 82 }).toBuffer();
  } catch {
    throw new DomainError("This profile photo could not be read. Choose a valid JPEG, PNG or WebP image.", 422);
  }
}
