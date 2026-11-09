// @vitest-environment jsdom
import React from "react";
import { afterEach, it, expect, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const state = vi.hoisted(() => ({ signOut: vi.fn(), pathname: "/cars/demo-car", signedIn: true }));
const signOut = state.signOut;
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("../../src/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: state.signedIn ? { user: { id: "demo" } } : null, isPending: false }),
    signOut: state.signOut,
  },
}));
import { Header } from "../../src/components/header";
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  state.pathname = "/cars/demo-car"; state.signedIn = true;
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
  const rentals = screen.getByRole("link", { name: "Rentals" });
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
it("uses identical marketplace links and account controls on home and inner pages", () => {
  state.signedIn = false; state.pathname = "/";
  const view = render(<Header />);
  const routes = () => Array.from(screen.getByRole("navigation", { name:"Main navigation" }).querySelectorAll("a")).map(a => [a.textContent, a.getAttribute("href")]);
  const home = routes();
  expect(screen.getByRole("link", { name:"Home" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name:"Sign up" }).getAttribute("href")).toBe("/login?mode=signup");
  expect(screen.queryByRole("link", { name:"Our roles" })).toBeNull();
  state.pathname = "/agencies"; view.rerender(<Header />);
  expect(routes()).toEqual(home);
  expect(screen.getByRole("link", { name:"Agencies" }).getAttribute("aria-current")).toBe("page");
});
it.each(["/login", "/booking-agreements/demo", "/booking-inspections/demo", "/booking-payments/demo", "/booking-refunds/demo", "/owner-payouts/demo", "/platform-records/RECEIPT/demo"])("uses a compact header for %s", pathname => {
  state.pathname = pathname; render(<Header />);
  expect(screen.queryByRole("navigation", { name:"Main navigation" })).toBeNull();
  expect(screen.queryByRole("button", { name:"Open navigation" })).toBeNull();
  expect(screen.getByRole("link", { name: pathname === "/login" ? "Back to marketplace" : "Back to workspace" }).getAttribute("href")).toBe(pathname === "/login" ? "/" : "/workspace");
});
it("refreshes the shared cart count on home and after cart changes", async () => {
  state.pathname = "/";
  let count=1;const get=vi.fn(async(url)=>({ok:true,json:async()=>String(url)==='/api/notifications/count'?{actorId:'demo',unread:0}:{count:++count}}));
  vi.stubGlobal("fetch", get); render(<Header />);
  expect((await screen.findByRole("link", {name:"Cart (2)"})).getAttribute("href")).toBe("/cart");
  window.dispatchEvent(new Event("rent2go:cart-changed"));
  expect(await screen.findByRole("link", {name:"Cart (3)"})).toBeDefined();
});
it("closes expanded navigation when the route changes without re-mounting the layout", async () => {
  const view=render(<Header />); const user=userEvent.setup();
  await user.click(screen.getByRole("button", {name:"Open navigation"}));
  state.pathname="/tours"; view.rerender(<Header />);
  expect(screen.getByRole("button", {name:"Open navigation"}).getAttribute("aria-expanded")).toBe("false");
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

it('uses a compact marketplace return for the restricted account-status portal',()=>{
 state.pathname='/account-status';render(<Header/>);expect(screen.queryByRole('navigation',{name:'Main navigation'})).toBeNull();expect(screen.getByRole('link',{name:'Back to marketplace'}).getAttribute('href')).toBe('/');
});

it("restores marketplace navigation for an active account privacy portal", async()=>{
 state.pathname="/account-status/privacy/request";
 vi.stubGlobal("fetch",vi.fn(async(url)=>({ok:true,json:async()=>String(url)==="/api/me"?{id:"demo"}:{count:0}})));
 render(<Header/>);
 expect(await screen.findByRole("navigation",{name:"Main navigation"})).toBeDefined();
 expect(screen.getByRole("link",{name:"Workspace"}).getAttribute("href")).toBe("/workspace");
});
it.each([{ok:false,id:"demo"},{ok:true,id:"another-account"}])("keeps denied or mismatched privacy identities compact: %j",async result=>{
 state.pathname="/account-status";const json=vi.fn(async()=>({id:result.id}));
 const get=vi.fn(async()=>({ok:result.ok,json}));vi.stubGlobal("fetch",get);render(<Header/>);
 await waitFor(()=>expect(get).toHaveBeenCalledTimes(1));
 if(result.ok)await waitFor(()=>expect(json).toHaveBeenCalledTimes(1));
 expect(screen.queryByRole("navigation",{name:"Main navigation"})).toBeNull();
 expect(screen.getByRole("link",{name:"Back to marketplace"})).toBeDefined();
});

it('takes signed-in agencies directly to the combined application and guide',()=>{
 render(<Header/>);expect(screen.getByRole('link',{name:'For agencies'}).getAttribute('href')).toBe('/workspace/application');expect(screen.getByRole('button',{name:'Notifications'}).closest('nav')).toBeNull();
});
