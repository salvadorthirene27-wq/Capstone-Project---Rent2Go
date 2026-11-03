import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
const env = loadEnv("test", process.cwd(), "");
export default defineConfig({
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"),
    },
  },
  test: {
    env: { ...env, DATABASE_URL: env.TEST_DATABASE_URL || "" },
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
