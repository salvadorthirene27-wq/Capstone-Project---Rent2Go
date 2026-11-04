// @vitest-environment jsdom
import React from "react";
import { it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { VehicleEditor } from "../../src/components/vehicles/vehicle-editor";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("protects unsaved facts from the file-removal refresh", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const initial = {
    id: "offer",
    vehicleId: "vehicle",
    agencyId: "agency",
    agencyName: "Demo",
    ownership: "CONSIGNED",
    ownerId: "owner",
    registration: "ABC1234",
    state: "DRAFT",
    version: 1,
    revision: 0,
    approvedRevision: null,
    facts: {
      make: "Toyota",
      model: "Vios",
      year: 2024,
      seats: 5,
      transmission: "AUTOMATIC",
      fuel: "GASOLINE",
      bodyType: "SEDAN",
      description: "Synthetic demo car",
      features: [],
      pickupInstructions: "Demo office",
    },
    terms: {
      rateCentavos: 200000,
      depositCentavos: 0,
      billingUnit: "24_HOUR",
      modes: ["SELF_DRIVE"],
      driverFeeCentavos: null,
      inclusions: "Car",
      exclusions: "Fuel",
      agreementTerms: "Synthetic demo terms",
      shares: {
        cosigner: 7000,
        agency: 1000,
        platform: 1000,
        maintenance: 1000,
      },
      allocationBasis: "SERVICE_REVENUE_EXCLUDING_REFUNDABLE_DEPOSIT",
    },
    capabilities: {
      isOwner: true,
      isAgency: false,
      independentReviewer: false,
      agencyActive: true,
    },
    files: [
      {
        id: "file",
        purpose: "OWNERSHIP",
        original_name: "demo.pdf",
        is_current: true,
      },
    ],
    revisions: [],
    agreements: [],
    events: [],
  };
  render(<VehicleEditor initial={initial as any} />);
  const user = userEvent.setup();
  await user.clear(screen.getByRole("textbox", { name: "Make" }));
  await user.type(screen.getByRole("textbox", { name: "Make" }), "Honda");
  const remove = screen.getByRole("button", { name: "Remove from draft" });
  expect((remove as HTMLButtonElement).disabled).toBe(true);
  await user.click(remove);
  expect(fetcher).not.toHaveBeenCalled();
  expect(
    (
      screen.getByRole("textbox", {
        name: "Make",
      }) as HTMLInputElement
    ).value,
  ).toBe("Honda");
});
