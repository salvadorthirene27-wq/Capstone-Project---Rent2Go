// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookingRequirements } from "../../src/components/booking-requirements";
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const document = {id:"file-1",purpose:"IDENTITY",name:"identity.pdf",mime:"application/pdf",size:100,uploadedAt:"2026-11-01",status:"PENDING",reason:"",expiresOn:null};
const state = { requestId:"request-1",requestVersion:4,status:"REQUIREMENTS_PENDING",canEdit:true,isReviewer:false,requiredPurposes:["IDENTITY"],documents:[] };
const response = (body: unknown, status = 200) => ({ok:status < 400,status,json:async()=>body});
afterEach(()=>{cleanup();vi.unstubAllGlobals();refresh.mockClear();});
it("uploads labeled private evidence with the displayed version",async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(response(state)).mockResolvedValueOnce(response({...state,requestVersion:5,documents:[document]}));vi.stubGlobal("fetch",fetcher);
 render(<BookingRequirements requestId="request-1"/>);const user=userEvent.setup();
 await user.upload(await screen.findByLabelText("Identity document file"),new File(["evidence"],"identity.pdf",{type:"application/pdf"}));
 fireEvent.submit(screen.getByRole("button",{name:"Upload identity document"}).closest("form")!);
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));const body=fetcher.mock.calls[1][1].body as FormData;
 expect(body.get("version")).toBe("4");expect(body.get("purpose")).toBe("IDENTITY");expect(body.get("file")).toBeInstanceOf(File);
 expect(await screen.findByRole("link",{name:"identity.pdf"})).toHaveProperty("href", "http://localhost:3000/api/booking-files/file-1");
});
it("locks submitted evidence and sends exact reviewer file/version and correction reason",async()=>{
 const submitted={...state,status:"UNDER_REVIEW",canEdit:false,isReviewer:true,documents:[document]};
 const fetcher=vi.fn().mockResolvedValueOnce(response(submitted)).mockResolvedValueOnce(response({...submitted,requestVersion:5}));vi.stubGlobal("fetch",fetcher);
 render(<BookingRequirements requestId="request-1"/>);const user=userEvent.setup();await screen.findByRole("link",{name:"identity.pdf"});
 expect(screen.queryByLabelText("Identity document file")).toBeNull();
 await user.type(screen.getByLabelText("Identity document correction reason"),"Please provide a clear image.");await user.click(screen.getByRole("button",{name:"Request identity document correction"}));
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({action:"REVIEW_DOCUMENT",version:4,fileId:"file-1",decision:"CHANGES_REQUESTED",reason:"Please provide a clear image."});
});
it("blocks stale actions until the current version is reloaded",async()=>{
 const ready={...state,documents:[document]};const fetcher=vi.fn().mockResolvedValueOnce(response(ready)).mockResolvedValueOnce(response({error:"Request changed."},409)).mockResolvedValueOnce(response({...ready,requestVersion:8}));vi.stubGlobal("fetch",fetcher);
 render(<BookingRequirements requestId="request-1"/>);const user=userEvent.setup();await user.click(await screen.findByRole("button",{name:"Submit requirements"}));
 expect((await screen.findByRole("alert")).textContent).toContain("Reload requirements");expect((screen.getByRole("button",{name:"Submit requirements"}) as HTMLButtonElement).disabled).toBe(true);
 await user.click(screen.getByRole("button",{name:"Reload requirements"}));await waitFor(()=>expect((screen.getByRole("button",{name:"Submit requirements"}) as HTMLButtonElement).disabled).toBe(false));
});
it("keeps ready requirements read-only and displays the human review result",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response({...state,status:"READY_FOR_APPROVAL",canEdit:false,documents:[{...document,status:"ACCEPTED"}]})));
 render(<BookingRequirements requestId="request-1"/>);await screen.findByText("Ready for approval");expect(screen.queryByLabelText("Identity document file")).toBeNull();expect(screen.queryByRole("button",{name:"Submit requirements"})).toBeNull();expect(screen.getByText(/Accepted/)).toBeTruthy();
});

it("requires a correction or rejection reason and completes only recorded decisions",async()=>{
 const submitted={...state,status:"UNDER_REVIEW",canEdit:false,isReviewer:true,documents:[document]};
 const fetcher=vi.fn().mockResolvedValueOnce(response(submitted)).mockResolvedValueOnce(response({...submitted,status:"REJECTED",requestVersion:5}));vi.stubGlobal("fetch",fetcher);
 render(<BookingRequirements requestId="request-1"/>);const user=userEvent.setup();await screen.findByRole("button",{name:"Complete review"});
 expect((screen.getByRole("button",{name:"Complete review"}) as HTMLButtonElement).disabled).toBe(true);
 expect((screen.getByRole("button",{name:"Request identity document correction"}) as HTMLButtonElement).disabled).toBe(true);
 expect((screen.getByRole("button",{name:"Reject request"}) as HTMLButtonElement).disabled).toBe(true);
 await user.type(screen.getByLabelText("Rejection reason"),"Evidence cannot establish eligibility.");await user.click(screen.getByRole("button",{name:"Reject request"}));
 await screen.findByText("Rejected");expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({action:"REJECT",version:4,reason:"Evidence cannot establish eligibility."});expect(screen.queryByRole("button",{name:"Reject request"})).toBeNull();
});
it("requires driver expiry and shows returned correction reasons",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response({...state,status:"CHANGES_REQUESTED",requiredPurposes:["IDENTITY","DRIVER_LICENSE"],documents:[{...document,status:"CHANGES_REQUESTED",reason:"Provide the reverse side."}]})));
 render(<BookingRequirements requestId="request-1"/>);expect(await screen.findByText(/Provide the reverse side/)).toBeTruthy();
 expect((screen.getByLabelText("Driver license expiry date") as HTMLInputElement).required).toBe(true);expect((screen.getByRole("button",{name:"Submit requirements"}) as HTMLButtonElement).disabled).toBe(true);
});

it("retires recorded document controls and refreshes server history after a decision",async()=>{
 const submitted={...state,status:"UNDER_REVIEW",canEdit:false,isReviewer:true,documents:[document]};
 const fetcher=vi.fn().mockResolvedValueOnce(response(submitted)).mockResolvedValueOnce(response({...submitted,requestVersion:5,documents:[{...document,status:"ACCEPTED"}]}));vi.stubGlobal("fetch",fetcher);
 render(<BookingRequirements requestId="request-1"/>);const user=userEvent.setup();await user.click(await screen.findByRole("button",{name:"Accept identity document"}));
 await waitFor(()=>expect(screen.queryByRole("button",{name:"Accept identity document"})).toBeNull());expect(screen.queryByRole("button",{name:"Request identity document correction"})).toBeNull();expect(refresh).toHaveBeenCalledOnce();expect((screen.getByRole("button",{name:"Complete review"}) as HTMLButtonElement).disabled).toBe(false);
});
