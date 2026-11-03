import { it, expect } from "vitest";
import { pooledHostname } from "../../scripts/lib/connection";
it("adds the pooler once and preserves an already-pooled Neon endpoint", () => {
  expect(pooledHostname("ep-sample.c-2.ap-southeast-1.aws.neon.tech")).toBe(
    "ep-sample-pooler.c-2.ap-southeast-1.aws.neon.tech",
  );
  expect(
    pooledHostname("ep-sample-pooler.c-2.ap-southeast-1.aws.neon.tech"),
  ).toBe("ep-sample-pooler.c-2.ap-southeast-1.aws.neon.tech");
  expect(
    pooledHostname("ep-sample-pooler-pooler.c-2.ap-southeast-1.aws.neon.tech"),
  ).toBe("ep-sample-pooler.c-2.ap-southeast-1.aws.neon.tech");
});
