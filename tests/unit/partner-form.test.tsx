// @vitest-environment jsdom
import React from "react";
import { it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PartnerForm } from "../../src/app/workspace/partner-form";
import { defaultApplication } from "../../src/modules/partners/schema";
it("locks editing while a delayed save is in flight so later keystrokes cannot be discarded", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
  render(
    <PartnerForm
      initial={{
        id: "test",
        ownerId: "owner",
        status: "DRAFT",
        version: 1,
        submittedRevision: 0,
        updatedAt: "2026-11-04T00:00:00Z",
        payload: defaultApplication,
        approvedAgency: null,
        files: [],
        revisions: [],
        reviews: [],
      }}
    />,
  );
  const user = userEvent.setup(),
    input = screen.getByLabelText("Trading / agency name");
  await user.type(input, "Saved agency");
  await user.click(screen.getByRole("button", { name: /^Save draft$/ }));
  expect(input.matches(":disabled")).toBe(true);
  await user.type(input, "unsaved extra characters");
  expect((input as HTMLInputElement).value).toBe("Saved agency");
  cleanup();
  vi.unstubAllGlobals();
});
