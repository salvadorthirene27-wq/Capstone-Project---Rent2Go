import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { BookingList } from "../../src/components/booking-list";

it("shows each request's actual lifecycle status in the renter and agency queue", () => {
  const list = {
    items: ["UNDER_REVIEW", "CHANGES_REQUESTED", "READY_FOR_APPROVAL", "REJECTED", "QUOTE_PENDING", "QUOTE_ACCEPTED", "QUOTE_DECLINED", "HOLD_EXPIRED"].map((status, index) => ({
      id: String(index), agencyId: "agency", agencyName: "Synthetic agency", status,
      version: 2, contact: { name: "Synthetic renter", email: "test@example.test", phone: "", notes: "" },
      createdAt: "2026-11-05T00:00:00Z",
      paymentEnvironment: null,
    })), total: 8, page: 1, pageCount: 1,
  };
  for (const base of ["/workspace/bookings", "/agency/agency/bookings"]) {
    const html = renderToStaticMarkup(<BookingList list={list} base={base}/>);
    for (const label of ["Under review", "Changes requested", "Ready for approval", "Rejected", "Quotation awaiting response", "Quotation accepted", "Quotation declined", "Hold expired"]) expect(html).toContain(label);
    expect(html).not.toContain("Requirements pending");
  }
});
