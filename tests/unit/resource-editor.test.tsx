// @vitest-environment jsdom
import React from "react";
import { it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { ResourceEditor } from "../../src/components/resources/resource-editor";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("protects unsaved driver changes from calendar updates and failed saves", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({
      ok: false,
      json: async () => ({
        error: "Save rejected. Reload the current record.",
      }),
    });
  vi.stubGlobal("fetch", fetcher);
  render(
    <ResourceEditor
      initial={
        {
          id: "driver",
          label: "Synthetic driver",
          kind: "DRIVER",
          total: 0,
          page: 1,
          pageCount: 1,
          occupations: [],
          driver: {
            name: "Demo driver",
            phone: "09171234567",
            licenseNumber: "DEMO123",
            licenseExpiry: "2099-12-31",
            active: true,
            version: 1,
          },
        } as any
      }
    />,
  );
  const user = userEvent.setup(),
    name = screen.getByRole("textbox", { name: "Driver name" });
  await user.clear(name);
  await user.type(name, "Updated driver");
  expect(
    screen.getByRole("button", { name: "Save block" }).matches(":disabled"),
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Save driver details" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("Save rejected"),
  );
  expect(
    screen.getByRole("button", { name: "Save block" }).matches(":disabled"),
  ).toBe(true);
  expect((name as HTMLInputElement).value).toBe("Updated driver");
});
