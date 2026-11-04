// @vitest-environment jsdom
import React from "react";
import { afterEach, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { CartEditor } from "../../src/app/cart/cart-editor";
afterEach(cleanup);
it("allows valid large tour parties to review their estimate using the published constraints", async () => {
  const selection = {
    kind: "TOUR",
    tourId: "824621c1-29ad-4a55-9698-bc1d151d4542",
    scheduleId: "301156f4-2e2e-41d1-b601-48501e0a490a",
    partySize: 51,
  };
  const quote = {
    selection,
    title: "Demo large group",
    agencyId: "agency",
    agencyName: "Demo Agency",
    startAt: "2031-01-01T00:00:00Z",
    endAt: "2031-01-01T09:00:00Z",
    priceUnit: "PER_PERSON",
    estimate: {
      serviceCentavos: 510000,
      refundableDepositCentavos: 0,
      estimatedDueCentavos: 510000,
    },
    constraints: { minParty: 5, maxParty: 100 },
  };
  const cart: any = {
    totalItems: 1,
    groups: [
      {
        agencyId: "agency",
        name: "Demo Agency",
        items: [
          {
            id: "item",
            version: 1,
            selection,
            savedQuote: quote,
            currentQuote: quote,
            status: "CURRENT",
          },
        ],
      },
    ],
    totals: quote.estimate,
    readyToRequest: true,
  };
  render(<CartEditor cart={cart} />);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Edit / review estimate" }));
  const guests = screen.getByRole("spinbutton", {
    name: "Guests",
  }) as HTMLInputElement;
  expect(guests.max).toBe("100");
  expect(guests.min).toBe("5");
  expect(guests.validity.rangeOverflow).toBe(false);
});
