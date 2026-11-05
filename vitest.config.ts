import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
const env = loadEnv("test", process.cwd(), "");
function isolatedRuntimeConnection(){
  if(!env.DATABASE_URL||env.NEON_PROJECT_ID!=="floral-flower-08375841")return "";
  const target=new URL(env.DATABASE_URL);
  if(target.pathname!=="/rent2go"||!target.hostname.startsWith("ep-dawn-rain-aowtcdg5")||decodeURIComponent(target.username)!=="rent2go_app")return "";
  target.pathname="/rent2go_test";
  return target.toString();
}
export default defineConfig({
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"),
    },
  },
  test: {
    env: { ...env, DATABASE_URL: env.TEST_DATABASE_URL || "", TEST_RUNTIME_DATABASE_URL: isolatedRuntimeConnection() },
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
