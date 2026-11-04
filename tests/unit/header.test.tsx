// @vitest-environment jsdom
import React from "react";
import { afterEach, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("../../src/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: "demo" } }, isPending: false }),
    signOut,
  },
}));
import { Header } from "../../src/components/header";
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("provides an accessible mobile navigation toggle with working public agency links", async () => {
  render(<Header />);
  const user = userEvent.setup(),
    toggle = screen.getByRole("button", { name: "Open navigation" });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  await user.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(
    screen.getByRole("link", { name: "Agencies" }).getAttribute("href"),
  ).toBe("/agencies");
});
it("shows a recoverable error rather than claiming sign-out when the provider rejects it", async () => {
  signOut.mockResolvedValue({
    error: { message: "Temporary provider problem" },
  });
  render(<Header />);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Sign out" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Unable to sign out",
  );
});
