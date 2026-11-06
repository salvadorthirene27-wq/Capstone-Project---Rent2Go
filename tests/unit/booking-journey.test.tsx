// @vitest-environment jsdom
import React from "react";
import {afterEach,expect,it} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
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
it("keeps saved sections reachable for an unrecognized status without inventing a next step",()=>{
 render(<BookingJourney status="FUTURE_STATUS"/>);
 expect(screen.queryByRole("link",{name:"Go to this step"})).toBeNull();
 expect(screen.getByRole("link",{name:"Refunds"}).getAttribute("href")).toBe("#refunds-heading");
 expect(screen.getByRole("navigation",{name:"Booking sections"})).toBeTruthy();
});
