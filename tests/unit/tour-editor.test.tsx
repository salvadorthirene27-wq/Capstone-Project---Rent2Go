// @vitest-environment jsdom
import React from "react";
import { it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
import { TourEditor } from "../../src/components/tours/tour-editor";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("preserves dirty package changes and prevents publishing or uploading an unsaved version", async () => {
  const fetcher = vi.fn().mockResolvedValue({
    ok: false,
    json: async () => ({
      error: "This package changed. Reload before continuing.",
    }),
  });
  vi.stubGlobal("fetch", fetcher);
  const payload = {
    title: "Synthetic tour",
    mode: "GROUP",
    description: "Synthetic complete description.",
    serviceArea: "Albay",
    meetingPoint: "Agency office",
    itinerary: [
      { title: "First stop", description: "A guided synthetic coastal stop." },
    ],
    inclusions: "Guide",
    exclusions: "Meals",
    eligibilityTerms: "Review attendance requirements.",
    terms: "Tour-only terms and conditions.",
    cancellationPolicy: "Request before the departure.",
    refundPolicy: "A separate refund decision is required.",
    priceCentavos: 120000,
    minParty: 1,
    maxParty: 8,
    transportIncluded: false,
    fulfillment: "TOUR_ONLY",
  };
  render(
    <TourEditor
      agencyId="agency"
      defaults={payload as any}
      modes={["GROUP", "PRIVATE"]}
      initial={
        {
          id: "tour",
          state: "DRAFT",
          version: 1,
          revision: 0,
          payload,
          files: [
            { id: "photo", is_current: true, original_name: "synthetic.png" },
          ],
          revisions: [],
          schedules: [],
        } as any
      }
    />,
  );
  const user = userEvent.setup(),
    title = screen.getByRole("textbox", { name: "Package title" });
  await user.type(title, " revised");
  expect(
    screen
      .getByRole("button", { name: "Publish package" })
      .matches(":disabled"),
  ).toBe(true);
  expect(
    screen.getByRole("button", { name: "Upload photo" }).matches(":disabled"),
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Save package" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("This package changed"),
  );
  expect((title as HTMLInputElement).value).toBe("Synthetic tour revised");
  fetcher.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ version: 2 }),
  });
  await user.click(screen.getByRole("button", { name: "Save package" }));
  expect(title.matches(":disabled")).toBe(true);
  await user.type(title, " changes during refresh");
  expect((title as HTMLInputElement).value).toBe("Synthetic tour revised");
  expect(
    screen
      .getByRole("button", { name: "Publish package" })
      .matches(":disabled"),
  ).toBe(true);
});
