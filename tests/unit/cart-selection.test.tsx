// @vitest-environment jsdom
import React from "react";
import { afterEach, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CartSelection } from "../../src/components/cart-selection";
const initial = {
  kind: "TOUR" as const,
  tourId: "824621c1-29ad-4a55-9698-bc1d151d4542",
  scheduleId: "301156f4-2e2e-41d1-b601-48501e0a490a",
  partySize: 2,
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("requires a server estimate before adding, and invalidates it when the guest count changes", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue({
      ok: true,
      json: async () => ({
        selection: initial,
        digest: "a".repeat(64),
        agencyId: "agency",
        agencyName: "Demo Agency",
        policyRevision: 1,
        sourceRevision: 2,
        estimate: {
          serviceCentavos: 300000,
          refundableDepositCentavos: 0,
          estimatedDueCentavos: 300000,
        },
      }),
    });
  vi.stubGlobal("fetch", fetch);
  render(<CartSelection initial={initial} maxParty={8} />);
  const user = userEvent.setup();
  expect(screen.queryByRole("button", { name: "Add to cart" })).toBeNull();
  await user.click(
    screen.getByRole("button", { name: "Review current estimate" }),
  );
  expect(
    await screen.findByRole("button", { name: "Add to cart" }),
  ).toBeTruthy();
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(initial);
  await user.clear(screen.getByRole("spinbutton", { name: "Guests" }));
  await user.type(screen.getByRole("spinbutton", { name: "Guests" }), "3");
  expect(screen.queryByRole("button", { name: "Add to cart" })).toBeNull();
});
it("offers account creation when estimate access requires sign-in", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "Sign in to continue." }),
      }),
  );
  render(<CartSelection initial={initial} />);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Review current estimate" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Sign in to continue",
  );
  expect(
    screen
      .getByRole("link", { name: "Sign in or create an account" })
      .getAttribute("href"),
  ).toBe("/login");
});
