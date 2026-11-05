// @vitest-environment jsdom
import React from "react";
import {it,expect,vi,afterEach} from "vitest";
import {render,screen,cleanup,waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {BookingFulfillment} from "../../src/components/booking-fulfillment";
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
const report={id:"report",revision:2,digest:"exact-digest",phase:"PRE",createdAt:"2032-01-01T00:00:00Z",decision:null,reason:null,acknowledgedAt:null,body:{odometerKm:1500,fuelEighths:6,cleanliness:"CLEAN",damageNotes:"Existing bumper scratch",roadworthy:true,safetyChecked:true,photoIds:["private-photo"]}};
const line={id:"line",title:"Synthetic car",kind:"RENTAL",startAt:"2032-01-01T00:00:00Z",endAt:"2032-01-02T00:00:00Z",partySize:2,driverName:null,stage:"NOT_STARTED",pre:report,post:null,availablePhotos:[],history:[],canInspectPre:false,canInspectPost:false,canAcknowledgePre:true,canAcknowledgePost:false,canRelease:false,canStartTour:false,canCompleteTour:false,overdue:false};
const state={serverNow:"2032-01-01T01:00:00Z",requestId:"request",requestVersion:3,status:"READY_FOR_SERVICE",isOwner:true,isOperator:false,environment:"DEMO",funded:true,lines:[line]};
const response=(body:unknown,status=200)=>({ok:status<400,status,json:async()=>body});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("shows exact private inspection and requires renter review before submitting exact document consent",async()=>{
 const accepted={...state,requestVersion:4,lines:[{...line,canAcknowledgePre:false,pre:{...report,decision:"ACCEPT"}}]},fetcher=vi.fn().mockResolvedValueOnce(response(state)).mockResolvedValueOnce(response(accepted)).mockResolvedValue(response(accepted));vi.stubGlobal("fetch",fetcher);
 render(<BookingFulfillment requestId="request"/>);const user=userEvent.setup();await screen.findByText("Existing bumper scratch");expect(screen.getByText("Demo booking — no money moves")).toBeTruthy();expect(screen.getByRole("link",{name:/inspection photo 1/i}).getAttribute("href")).toBe("/api/inspection-photos/private-photo");
 const accept=screen.getByRole("button",{name:"Accept pre-inspection"});expect((accept as HTMLButtonElement).disabled).toBe(true);await user.click(screen.getByLabelText(/I reviewed this exact pre-inspection/i));await user.click(accept);await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(3));const body=JSON.parse(fetcher.mock.calls[1][1].body);expect(body).toMatchObject({action:"ACK_INSPECTION",version:3,lineId:"line",inspectionId:"report",digest:"exact-digest",decision:"ACCEPT",reason:""});expect(body.idempotencyKey).toBeTruthy();
});
it("requires a dispute reason and locks further actions after stale version conflict",async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(response(state)).mockResolvedValueOnce(response({error:"Request changed"},409));vi.stubGlobal("fetch",fetcher);render(<BookingFulfillment requestId="request"/>);const user=userEvent.setup(),button=await screen.findByRole("button",{name:"Dispute pre-inspection"});expect((button as HTMLButtonElement).disabled).toBe(true);await user.type(screen.getByLabelText("Pre-inspection dispute reason"),"Photo does not show this damage");await user.click(button);expect(await screen.findByRole("alert")).toBeTruthy();expect((screen.getByRole("button",{name:"Accept pre-inspection"}) as HTMLButtonElement).disabled).toBe(true);
});
it("shows active and returned services independently without implying deposit settlement",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response({...state,status:"SERVICE_ACTIVE",lines:[{...line,stage:"RENTAL_ACTIVE",canAcknowledgePre:false,overdue:true},{...line,id:"tour",title:"Synthetic tour",kind:"TOUR",stage:"TOUR_COMPLETED",pre:null,canAcknowledgePre:false}]})));render(<BookingFulfillment requestId="request"/>);expect(await screen.findByText("Rental active")).toBeTruthy();expect(screen.getByText("Tour completed")).toBeTruthy();expect(screen.getByText(/Overdue return/)).toBeTruthy();expect(screen.getByText(/Deposits, extra charges and earnings require separate reconciliation/)).toBeTruthy();expect(screen.queryByRole("button",{name:/Accept pre-inspection/})).toBeNull();
});
it("agency handover requires explicit confirmation and cannot run before authoritative pickup time",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response({...state,isOwner:false,isOperator:true,serverNow:"2031-12-31T00:00:00Z",lines:[{...line,canAcknowledgePre:false,canRelease:true,pre:{...report,decision:"ACCEPT"}}]})));render(<BookingFulfillment requestId="request"/>);await screen.findByText("Synthetic car");expect(screen.queryByRole("button",{name:"Record vehicle handover"})).toBeNull();
});
