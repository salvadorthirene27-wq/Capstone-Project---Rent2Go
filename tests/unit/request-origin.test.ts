import { afterEach, it, expect, vi } from "vitest";
import { requireOrigin } from "../../src/lib/http";
afterEach(() => vi.unstubAllEnvs());
const request = (origin: string) =>
  new Request("http://localhost:3100/api/cart/quote", {
    headers: { Origin: origin },
  });
it("permits only matching loopback aliases when explicitly enabled for the local demo", () => {
  vi.stubEnv("APP_ORIGIN", "http://localhost:3100");
  vi.stubEnv("LOCAL_DEMO_LOOPBACK_ALIASES", "true");
  expect(() => requireOrigin(request("http://127.0.0.1:3100"))).not.toThrow();
  for (const origin of [
    "https://127.0.0.1:3100",
    "http://127.0.0.1:3101",
    "http://evil.localhost:3100",
    "https://example.com",
    "null",
    "http://127.0.0.1:3100/extra",
  ])
    expect(() => requireOrigin(request(origin))).toThrow();
});
it("remains strict without local opt-in or for a hosted origin", () => {
  vi.stubEnv("APP_ORIGIN", "http://localhost:3100");
  vi.stubEnv("LOCAL_DEMO_LOOPBACK_ALIASES", "false");
  expect(() => requireOrigin(request("http://127.0.0.1:3100"))).toThrow();
  vi.stubEnv("LOCAL_DEMO_LOOPBACK_ALIASES", "true");
  vi.stubEnv("APP_ORIGIN", "https://rent2go.example");
  expect(() => requireOrigin(request("http://127.0.0.1:3100"))).toThrow();
  expect(() => requireOrigin(request("https://rent2go.example"))).not.toThrow();
});
