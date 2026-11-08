// @vitest-environment jsdom
import React from "react";
import {afterEach,expect,it,vi} from "vitest";
import {cleanup,render,screen,within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const state=vi.hoisted(()=>({path:"/workspace"}));
vi.mock("next/navigation",()=>({usePathname:()=>state.path}));
import {WorkspaceNavigation} from "../../src/components/workspace-navigation";
afterEach(()=>{cleanup();state.path="/workspace";});

it("selects the agency booking section without also selecting its overview",()=>{
 state.path="/agency/365ef66a-beec-48fd-88c7-13245a359e31/bookings/request";
 render(<WorkspaceNavigation role="AGENCY_ADMIN"/>);
 const nav=screen.getByRole("navigation",{name:"Workspace navigation"});
 expect(within(nav).getByRole("link",{name:"Agency bookings"}).getAttribute("aria-current")).toBe("page");
 expect(within(nav).getByRole("link",{name:"Agency overview"}).getAttribute("aria-current")).toBeNull();
 expect(nav.querySelectorAll('[aria-current="page"]').length).toBe(1);
 expect(within(nav).getByRole("link",{name:"Fleet & listings"}).getAttribute("href")).toBe("/agency/365ef66a-beec-48fd-88c7-13245a359e31/vehicles");
});
it("keeps platform review links scoped to the super administrator",()=>{
 const view=render(<WorkspaceNavigation role="RENTER"/>);
 expect(screen.queryByRole("link",{name:"Partner reviews"})).toBeNull();
 expect(screen.queryByRole("link",{name:"Agency overview"})).toBeNull();
 expect(screen.getByRole("link",{name:"My booking requests"}).getAttribute("href")).toBe("/workspace/bookings");
 view.rerender(<WorkspaceNavigation role="SUPER_ADMIN"/>);
 expect(screen.getByRole("link",{name:"Partner reviews"}).getAttribute("href")).toBe("/admin");
});
it("selects platform reports without also selecting the partner review root",()=>{
 state.path="/admin/reports";render(<WorkspaceNavigation role="SUPER_ADMIN"/>);
 const nav=screen.getByRole("navigation",{name:"Workspace navigation"});
 expect(within(nav).getByRole("link",{name:"Platform reports"}).getAttribute("aria-current")).toBe("page");
 expect(within(nav).getByRole("link",{name:"Partner reviews"}).getAttribute("aria-current")).toBeNull();
 expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
});
it("closes the menu with Escape and restores focus to its toggle",async()=>{
 render(<WorkspaceNavigation role="COSIGNER"/>);const user=userEvent.setup(),toggle=screen.getByRole("button",{name:"Workspace menu"});
 await user.click(toggle);expect(toggle.getAttribute("aria-expanded")).toBe("true");
 screen.getByRole("link",{name:"My personal vehicles"}).focus();await user.keyboard("{Escape}");
 expect(toggle.getAttribute("aria-expanded")).toBe("false");expect(document.activeElement).toBe(toggle);
});
it("closes on a selected link, an external focus change, and a route change",async()=>{
 const view=render(<><WorkspaceNavigation role="RENTER"/><button>Outside</button></>),user=userEvent.setup(),toggle=screen.getByRole("button",{name:"Workspace menu"});
 const home=screen.getByRole("link",{name:"Workspace home"});home.addEventListener("click",e=>e.preventDefault());
 await user.click(toggle);await user.click(home);expect(toggle.getAttribute("aria-expanded")).toBe("false");
 await user.click(toggle);await user.click(screen.getByRole("button",{name:"Outside"}));expect(toggle.getAttribute("aria-expanded")).toBe("false");
 await user.click(toggle);state.path="/workspace/bookings";view.rerender(<><WorkspaceNavigation role="RENTER"/><button>Outside</button></>);
 expect(toggle.getAttribute("aria-expanded")).toBe("false");
});

it.each(["SUPER_ADMIN","AGENCY_ADMIN","RENTER","COSIGNER"] as const)("limits a restricted %s to account requests and marketplace",role=>{
 state.path="/account-status/privacy/request";render(<WorkspaceNavigation role={role} limited/>);
 const nav=screen.getByRole("navigation",{name:"Workspace navigation"});
 expect(Array.from(nav.querySelectorAll("a")).map(a=>a.getAttribute("href"))).toEqual(["/account-status","/"]);
 expect(screen.getByRole("link",{name:"Account & privacy requests"}).getAttribute("aria-current")).toBe("page");
 expect(screen.getByRole("button",{name:"Account menu"})).toBeDefined();
});
