import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
export default defineConfig({ test: { env: loadEnv("test",process.cwd(),""), testTimeout:20000, hookTimeout:20000 } });
