import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const env = { ...process.env };
if (process.platform === "win32") {
  const preload = fileURLToPath(
    new URL("./windows-mkdir.cjs", import.meta.url),
  ).replaceAll("\\", "/");
  env.NODE_OPTIONS =
    `${env.NODE_OPTIONS || ""} --require ${JSON.stringify(preload)}`.trim();
}
const result = spawnSync(
  process.execPath,
  [require.resolve("next/dist/bin/next"), "build", "--webpack"],
  { stdio: "inherit", env },
);
if (result.error) {
  console.error("Unable to launch the Next.js build.");
  process.exit(1);
}
process.exit(result.status ?? 1);
