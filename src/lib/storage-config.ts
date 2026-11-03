import { DomainError } from "../modules/partners/workflow";
export function storageDriver(value: string | undefined): "s3" | "local" {
  if (value !== "s3" && value !== "local")
    throw new DomainError(
      "Configure private storage before uploading documents.",
      503,
    );
  return value;
}
