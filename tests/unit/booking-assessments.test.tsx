// @vitest-environment jsdom
import React from "react";
import {afterEach,it,expect,vi} from "vitest";
import {render,screen,cleanup,waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const {refresh}=vi.hoisted(()=>({refresh:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh})}));
import {BookingAssessments} from "../../src/components/booking-assessments";
const id="940bc3b8-0980-4499-8a6c-36df493d1bcb",hash="a".repeat(64);
function state(){return {requestId:id,requestVersion:4,status:"CANCELLED_RECONCILIATION_PENDING",isOwner:true,isOperator:false,source:{blockedReason:null,lines:[]},canPropose:false,effective:null,history:[],historyPage:1,historyPages:1,current:{id,revision:1,digest:hash,createdAt:"2026-11-07T00:00:00Z",reason:"Saved itemized terms",environment:"DEMO",decision:null,decisionReason:null,stale:false,canAccept:true,canDispute:true,canWithdraw:false,body:{requiresOwnerAllocationReview:false,proposal:{lines:[],credits:[],charges:[],deliveredServiceCentavos:10000,serviceCreditCentavos:0,extraChargeCentavos:0,obligationCentavos:10000,quotedDepositCentavos:20000},funds:{confirmedCentavos:30000,paidRefundCentavos:0,reservedRefundCentavos:0,additionalBalanceCentavos:0,refundDueCentavos:20000,overReservedCentavos:0}}}};}
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks();});
it("requires separate financial consent and sends the exact assessment digest/version",async()=>{
 const s=state(),fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>s});vi.stubGlobal("fetch",fetcher);render(<BookingAssessments requestId={id}/>);const user=userEvent.setup();
 const button=await screen.findByRole("button",{name:"Accept itemized assessment"});expect((button as HTMLButtonElement).disabled).toBe(true);await user.click(button);expect(fetcher).toHaveBeenCalledTimes(1);
 await user.click(screen.getByRole("checkbox",{name:/I reviewed this version/}));await user.click(button);
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));const cmd=JSON.parse(fetcher.mock.calls[1][1].body);expect(cmd).toMatchObject({action:"DECIDE_ASSESSMENT",assessmentId:id,digest:hash,version:4,decision:"ACCEPT",consent:true});expect(refresh).toHaveBeenCalledTimes(1);
});
it("keeps stale assessments unacceptible while allowing a reasoned dispute",async()=>{
 const s=state();s.current.stale=true;s.current.canAccept=false;const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>s});vi.stubGlobal("fetch",fetcher);render(<BookingAssessments requestId={id}/>);const user=userEvent.setup();
 const button=await screen.findByRole("button",{name:"Dispute with reason"});expect(screen.queryByRole("button",{name:"Accept itemized assessment"})).toBeNull();expect((button as HTMLButtonElement).disabled).toBe(true);
 await user.type(screen.getByLabelText("Review reason"),"The return credit is missing.");await user.click(button);await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({decision:"DISPUTE",consent:false,reason:"The return credit is missing.",digest:hash});
});
it("shows a failed review without claiming acceptance or refreshing away its reason",async()=>{
 const s=state(),fetcher=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>s}).mockResolvedValueOnce({ok:false,json:async()=>({error:"Financial facts changed; refresh the assessment."})});vi.stubGlobal("fetch",fetcher);render(<BookingAssessments requestId={id}/>);const user=userEvent.setup();
 const button=await screen.findByRole("button",{name:"Dispute with reason"});await user.type(screen.getByLabelText("Review reason"),"Please correct the credit.");await user.click(button);expect((await screen.findByRole("alert")).textContent).toContain("Financial facts changed");expect((screen.getByLabelText("Review reason") as HTMLTextAreaElement).value).toBe("Please correct the credit.");expect(refresh).not.toHaveBeenCalled();
});
