import { expect, it } from "vitest";
import { bookingWorkerTarget } from "../../scripts/lib/booking-worker-target";
const demo = "postgresql://runtime:synthetic@ep-dawn-rain-aowtcdg5.example/rent2go";
const test = demo.replace("/rent2go", "/rent2go_test");
const env = { NEON_PROJECT_ID: "floral-flower-08375841", DATABASE_URL: demo, TEST_DATABASE_URL: test };
it("requires explicit worker opt-in and the designated project, host and database", () => {
  expect(() => bookingWorkerTarget(env, [])).toThrow();
  expect(bookingWorkerTarget(env, ["--enable"])).toBe(demo);
  expect(bookingWorkerTarget(env, ["--enable", "--test"])).toBe(test);
  for (const bad of [{ NEON_PROJECT_ID: "old-project" }, { DATABASE_URL: demo.replace("ep-dawn-rain-aowtcdg5", "old-db") }, { DATABASE_URL: test }])
    expect(() => bookingWorkerTarget({ ...env, ...bad }, ["--enable"])).toThrow();
  expect(() => bookingWorkerTarget({ ...env, TEST_DATABASE_URL: demo }, ["--enable", "--test"])).toThrow();
});
