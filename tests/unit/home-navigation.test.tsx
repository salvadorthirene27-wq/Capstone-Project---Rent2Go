// @vitest-environment jsdom
import React from "react";
import { afterEach, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const state = vi.hoisted(() => ({ signedIn: false, signOut: vi.fn() }));
vi.mock("../../src/lib/auth-client", () => ({ authClient: {
  useSession: () => ({ data: state.signedIn ? { user: { id: "demo" } } : null, isPending: false }), signOut: state.signOut,
} }));
import { HomeNavigation } from "../../src/components/home-navigation";
afterEach(() => { cleanup(); state.signedIn=false; vi.resetAllMocks(); });
it("connects landing visitors to real registration, marketplace, cart and partner routes", () => {
  render(<HomeNavigation />);
  expect(screen.getByRole("link", { name: "Sign Up" }).getAttribute("href")).toBe("/login?mode=signup");
  expect(screen.getByRole("link", { name: "Rentals" }).getAttribute("href")).toBe("/rentals");
  expect(screen.getByRole("link", { name: "Cart" }).getAttribute("href")).toBe("/cart");
  expect(screen.getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBe("page");
});
it("supports keyboard dismissal of mobile navigation with focus restoration", async () => {
  render(<HomeNavigation />); const user=userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open navigation" }));
  expect(screen.getByRole("button", { name: "Close navigation" }).getAttribute("aria-expanded")).toBe("true");
  screen.getByRole("link", { name: "Tours" }).focus(); await user.keyboard("{Escape}");
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open navigation" }));
});
it("shows the current account workspace and a recoverable provider sign-out error", async () => {
  state.signedIn=true; state.signOut.mockResolvedValue({ error: { message: "Unavailable" } }); render(<HomeNavigation />);
  expect(screen.queryByRole("link", { name: "Sign Up" })).toBeNull();
  expect(screen.getByRole("link", { name: "Workspace" }).getAttribute("href")).toBe("/workspace");
  await userEvent.setup().click(screen.getByRole("button", { name: "Sign out" }));
  expect(screen.getByRole("alert").textContent).toContain("Unable to sign out");
});
it("places the mobile toggle before the revealed links for forward keyboard navigation", async () => {
  render(<HomeNavigation />); const user=userEvent.setup();
  const toggle=screen.getByRole("button", { name: "Open navigation" });
  await user.click(toggle); await user.tab();
  expect(document.activeElement).toBe(screen.getByRole("link", { name: "Home" }));
});
it("closes the landing menu when focus leaves navigation without stealing focus", async () => {
  render(<><HomeNavigation /><button>Browse page content</button></>);
  const user=userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open navigation" }));
  await user.tab();
  expect(screen.getByRole("button", { name: "Close navigation" }).getAttribute("aria-expanded")).toBe("true");
  await user.click(screen.getByRole("button", { name: "Browse page content" }));
  expect(screen.getByRole("button", { name: "Open navigation" }).getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Browse page content" }));
});
