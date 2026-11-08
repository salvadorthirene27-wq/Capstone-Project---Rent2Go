// @vitest-environment jsdom
import React from "react";
import {afterEach,expect,it} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {BookingJourney} from "../../src/components/booking-journey";
afterEach(cleanup);
it("directs corrections to documents rather than inviting premature payment",()=>{
 render(<BookingJourney status="CHANGES_REQUESTED"/>);
 expect(screen.getByRole("heading",{name:"Update the requested information"})).toBeTruthy();
 expect(screen.getByRole("link",{name:"Go to this step"}).getAttribute("href")).toBe("#requirements-heading");
});
it("directs a delivered booking to assessment without claiming financial completion",()=>{
 render(<BookingJourney status="FULFILLMENT_RECONCILIATION_PENDING"/>);
 expect(screen.getByRole("link",{name:"Go to this step"}).getAttribute("href")).toBe("#assessment-title");
 expect(screen.getByText(/amount to reconcile/)).toBeTruthy();
});
it("keeps saved sections reachable for an unrecognized status without inventing a next step",async()=>{
 render(<BookingJourney status="FUTURE_STATUS"/>);
 expect(screen.queryByRole("link",{name:"Go to this step"})).toBeNull();
 await userEvent.click(screen.getByText("All booking sections"));
 expect(screen.getByRole("link",{name:"Refunds"}).getAttribute("href")).toBe("#refunds-heading");
 expect(screen.getByRole("navigation",{name:"Booking sections"})).toBeTruthy();
});
it("keeps the next step visible while secondary section links start collapsed and remain reachable",async()=>{
 render(<BookingJourney status="READY_FOR_SERVICE"/>);
 const menu=screen.getByText("All booking sections").closest("details")!;
 expect(menu.open).toBe(false);
 expect(screen.getByRole("link",{name:"Go to this step"}).getAttribute("href")).toBe("#fulfillment-heading");
 // JSDOM does not model native closed-details visibility. The real-browser
 // review checks that layout; here we verify the disclosure state and targets.
 expect(menu.contains(screen.getByRole("link",{name:"Refunds"}))).toBe(true);
 await userEvent.click(screen.getByText("All booking sections"));
 expect(menu.open).toBe(true);
 expect(screen.getByRole("link",{name:"Refunds"}).getAttribute("href")).toBe("#refunds-heading");
 await userEvent.click(screen.getByText("All booking sections"));
 expect(menu.open).toBe(false);
});
