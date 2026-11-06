// @vitest-environment jsdom
import React from "react";
import { afterEach, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/cars/demo-car" }));
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
it("keeps the rental section selected on a car detail page and closes the mobile menu after navigation", async () => {
  render(<Header />);
  const user = userEvent.setup();
  const rentals = screen.getByRole("link", { name: "Car rentals" });
  expect(rentals.getAttribute("aria-current")).toBe("page");
  expect(
    screen.getByRole("link", { name: "Home" }).getAttribute("aria-current"),
  ).toBeNull();
  await user.click(screen.getByRole("button", { name: "Open navigation" }));
  rentals.addEventListener("click", (e) => e.preventDefault());
  await user.click(rentals);
  expect(
    screen
      .getByRole("button", { name: "Open navigation" })
      .getAttribute("aria-expanded"),
  ).toBe("false");
});
it("returns keyboard focus to the menu button when Escape closes navigation", async () => {
  render(<Header />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open navigation" }));
  screen.getByRole("link", { name: "Tours" }).focus();
  await user.keyboard("{Escape}");
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Open navigation" }),
  );
});
it("dismisses expanded navigation when keyboard focus moves into page content", async () => {
  render(<><Header /><main><button>Page action</button></main></>);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open navigation" }));
  await user.tab();
  expect(screen.getByRole("button", { name: "Close navigation" }).getAttribute("aria-expanded")).toBe("true");
  await user.click(screen.getByRole("button", { name: "Page action" }));
  expect(screen.getByRole("button", { name: "Open navigation" }).getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Page action" }));
});
