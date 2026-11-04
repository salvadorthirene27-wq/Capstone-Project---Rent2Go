// @vitest-environment jsdom
import React from "react";
import { afterEach, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckoutForm } from "../../src/app/checkout/checkout-form";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("retains the same submission command after a lost response and shows requests without claiming payment", async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(Error("Connection interrupted"))
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        requests: [{ id: "request", agencyName: "Demo Agency" }],
      }),
    });
  vi.stubGlobal("fetch", fetch);
  const cart: any = {
    version: 7,
    groups: [
      {
        items: [
          { id: "item", version: 2, savedQuote: { digest: "a".repeat(64) } },
        ],
      },
    ],
  };
  render(<CheckoutForm cart={cart} name="Demo Renter" />);
  const user = userEvent.setup();
  await user.type(
    screen.getByRole("textbox", { name: "Phone number" }),
    "+639171234567",
  );
  await user.click(
    screen.getByRole("button", { name: "Submit booking request" }),
  );
  expect(await screen.findByRole("alert")).toBeTruthy();
  await user.click(
    screen.getByRole("button", { name: "Submit booking request" }),
  );
  expect((await screen.findByRole("status")).textContent).toContain(
    "no payment was made",
  );
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(
    JSON.parse(fetch.mock.calls[1][1].body),
  );
  expect(
    screen
      .getByRole("link", { name: "View your request to Demo Agency" })
      .getAttribute("href"),
  ).toBe("/workspace/bookings/request");
});
