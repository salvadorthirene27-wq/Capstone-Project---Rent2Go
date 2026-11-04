import { it, expect, vi } from "vitest";
import { db } from "../../src/lib/db";
import { EventEmitter } from "node:events";
import type { PoolClient } from "pg";
it("handles checked-out socket errors without leaking secrets or hiding failed queries", () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const client = new EventEmitter() as PoolClient;
    db.emit("connect", client);
    expect(() =>
      client.emit(
        "error",
        Object.assign(new Error("private-active-socket"), {
          code: "ECONNRESET",
        }),
      ),
    ).not.toThrow();
    expect(JSON.stringify(spy.mock.calls)).not.toContain(
      "private-active-socket",
    );
  } finally {
    spy.mockRestore();
  }
});
it("does not crash on an idle database socket failure or log connection details", () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const failure = Object.assign(new Error("private-connection-sentinel"), {
      code: "ECONNRESET",
    });
    expect(() => db.emit("error", failure)).not.toThrow();
    expect(JSON.stringify(spy.mock.calls)).not.toContain(
      "private-connection-sentinel",
    );
  } finally {
    spy.mockRestore();
  }
});
