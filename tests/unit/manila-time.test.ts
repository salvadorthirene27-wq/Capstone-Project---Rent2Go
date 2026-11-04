import { it, expect } from "vitest";
import { manilaInputToIso } from "../../src/lib/manila-time";
it("interprets calendar inputs as Manila time regardless of the machine timezone", () => {
  expect(manilaInputToIso("2031-01-01T08:30")).toBe("2031-01-01T00:30:00.000Z");
  expect(() => manilaInputToIso("2031-02-30T08:30")).toThrow();
  expect(() => manilaInputToIso("2031-01-01T08:30Z")).toThrow();
});
