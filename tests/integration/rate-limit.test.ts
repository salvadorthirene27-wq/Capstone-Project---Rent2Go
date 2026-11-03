import { afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import { rateLimit } from "../../src/lib/rate-limit";
afterAll(() => db.end());
it("enforces a shared database-backed budget under concurrency", async () => {
  const key = `fixture:${randomUUID()}`;
  const results = await Promise.allSettled(
    Array.from({ length: 6 }, () => rateLimit(key, 5)),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
  const failure = results.find(
    (r) => r.status === "rejected",
  ) as PromiseRejectedResult;
  expect(failure.reason.status).toBe(429);
});
