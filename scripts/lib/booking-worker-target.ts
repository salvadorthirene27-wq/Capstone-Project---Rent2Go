export function bookingWorkerTarget(env: Record<string, string | undefined>, args: string[]) {
  if ((!args.includes("--enable") && env.BOOKING_HOLD_WORKER_ENABLED !== "true") || env.NEON_PROJECT_ID !== "floral-flower-08375841")
    throw new Error("Explicitly enable the worker on the designated Rent2Go project.");
  const test = args.includes("--test");
  const connection = test ? env.TEST_DATABASE_URL : env.DATABASE_URL;
  let target: URL;
  try {
    target = new URL(connection ?? "");
  }
  catch {
    throw new Error("Worker database target is missing or invalid.");
  }
  if (!target.hostname.startsWith("ep-dawn-rain-aowtcdg5") || target.pathname !== (test ? "/rent2go_test" : "/rent2go"))
    throw new Error("Unexpected worker database target.");
  return connection!;
}
