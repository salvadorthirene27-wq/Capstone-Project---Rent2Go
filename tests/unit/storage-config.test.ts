import { it, expect } from "vitest";
import { storageDriver } from "../../src/lib/storage-config";
it("requires an explicit supported storage driver", () => {
  expect(() => storageDriver(undefined)).toThrow(/configure/i);
  expect(() => storageDriver("s33")).toThrow(/configure/i);
  expect(storageDriver("local")).toBe("local");
  expect(storageDriver("s3")).toBe("s3");
});
