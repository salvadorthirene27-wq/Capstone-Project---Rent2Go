// @vitest-environment jsdom
import React from "react";
import { it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VehicleActions } from "../../src/components/vehicles/vehicle-actions";
const offer = {
  id: "offer-id",
  state: "AGREEMENT_PENDING",
  ownership: "CONSIGNED",
  version: 7,
  revision: 3,
  capabilities: {
    isOwner: true,
    isAgency: false,
    independentReviewer: false,
    agencyActive: true,
  },
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("requires explicit consent and posts the displayed immutable agreement version", async () => {
  const fetcher = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) }),
    done = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(
    <VehicleActions offer={offer as any} dirty={false} onComplete={done} />,
  );
  const user = userEvent.setup();
  const accept = screen.getByRole("button", {
    name: "Accept agreement version 3",
  });
  expect((accept as HTMLButtonElement).disabled).toBe(true);
  await user.click(
    screen.getByRole("checkbox", {
      name: /I have reviewed and accept agreement version 3/,
    }),
  );
  await user.click(accept);
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    action: "ACCEPT",
    version: 7,
    revision: 3,
    reason: "",
  });
  expect(done).toHaveBeenCalledOnce();
});
it("retains the review and reports a failed transition without confirming consent", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: false,
        json: async () => ({ error: "This agreement changed. Reload it." }),
      }),
  );
  const done = vi.fn();
  render(
    <VehicleActions offer={offer as any} dirty={false} onComplete={done} />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("checkbox"));
  await user.click(
    screen.getByRole("button", { name: "Accept agreement version 3" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "agreement changed",
  );
  expect(done).not.toHaveBeenCalled();
});
