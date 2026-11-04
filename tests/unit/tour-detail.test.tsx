import React from "react";
import { it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("../../src/modules/tours/service", () => ({
  publicTour: async () => ({
    id: "tour",
    agencyId: "agency",
    agencyName: "Synthetic agency",
    photos: [],
    schedules: [],
    scheduleTotal: 0,
    page: 1,
    pageCount: 1,
    payload: {
      title: "Large synthetic group tour",
      mode: "GROUP",
      description: "Synthetic complete tour description.",
      serviceArea: "Albay",
      meetingPoint: "Synthetic agency office",
      itinerary: [
        { title: "First stop", description: "Synthetic guided coastal visit." },
      ],
      inclusions: "Guide",
      exclusions: "Meals",
      eligibilityTerms: "Identity and attendance review.",
      terms: "Synthetic tour-only package terms.",
      cancellationPolicy: "Request before tour departure.",
      refundPolicy: "Separate reconciled refund review.",
      priceCentavos: 500000,
      minParty: 1,
      maxParty: 500,
      transportIncluded: false,
      fulfillment: "TOUR_ONLY",
    },
  }),
}));
import Page from "../../src/app/tours/[id]/page";
it("retains tour details and a useful validation message when a valid party exceeds the supported amount", async () => {
  const page = await Page({
    params: Promise.resolve({ id: "tour" }),
    searchParams: Promise.resolve({ partySize: "201" }),
  });
  const html = renderToStaticMarkup(page);
  expect(html).toContain("Large synthetic group tour");
  expect(html).toContain("supported quotation amount");
  expect(html).toContain("Check departure dates");
});
