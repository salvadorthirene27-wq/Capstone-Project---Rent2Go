// @vitest-environment jsdom
import React from "react";
import {it,expect,afterEach} from "vitest";
import {render,screen,cleanup} from "@testing-library/react";
import {RentalFleetCard} from "../../src/components/rental-fleet-card";
afterEach(cleanup);
it("keeps vehicle details beside one booking action and preserves the selected rental dates",()=>{
 const car={id:"car",agencyId:"agency",agencyName:"Bicol Journeys",serviceAreas:"Albay",photoIds:["photo"],facts:{make:"Toyota",model:"Vios",year:2024,bodyType:"SEDAN",seats:5,transmission:"AUTOMATIC",fuel:"GASOLINE"},pricing:{rateCentavos:200000,billingUnit:"24_HOUR",depositCentavos:300000,modes:["SELF_DRIVE"]},reasons:["Matches your selected transmission"]} as Parameters<typeof RentalFleetCard>[0]["car"];
 const href="/cars/car?startAt=2031-06-01&endAt=2031-06-02";
 render(<RentalFleetCard car={car} href={href}/>);
 expect(screen.getByRole("link",{name:"Book now: Toyota Vios from Bicol Journeys"}).getAttribute("href")).toBe(href+"#rental-booking");
 expect(screen.getByRole("img").getAttribute("src")).toBe("/api/vehicle-files/photo");
 expect(screen.getByText("per 24 hours")).toBeDefined();
 expect(screen.getByText("Refundable deposit:").textContent).toContain("3,000");
 expect(screen.getByText("Seats, including driver")).toBeDefined();
 expect(screen.queryByText(/instant confirmation/i)).toBeNull();
});
