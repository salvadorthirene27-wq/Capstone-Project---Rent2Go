// @vitest-environment jsdom
import React,{useState} from "react";
import {it,expect,vi,afterEach} from "vitest";
import {render,screen,cleanup} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {ExtraChargePolicyEditor,ExtraChargePolicySummary} from "../../src/components/extra-charge-policies";
import type {ExtraChargePolicy} from "../../src/modules/partners/extra-charges";
afterEach(cleanup);
function Form({changed}:{changed:(p:ExtraChargePolicy[])=>void}){const [value,setValue]=useState<ExtraChargePolicy[]>();return <ExtraChargePolicyEditor value={value} services={["SELF_DRIVE","GROUP_TOUR"]} onChange={v=>{setValue(v);changed(v);}}/>;}
it("starts extra charges unconfigured and preserves explicit percentages with a100% total",async()=>{
 const changed=vi.fn();render(<Form changed={changed}/>);const user=userEvent.setup();expect(screen.queryByRole("textbox",{name:/Cosigner/})).toBeNull();await user.click(screen.getByRole("checkbox",{name:"Damage · Consigned rental"}));const cosigner=screen.getByRole("textbox",{name:/Damage · Consigned rental · Cosigner/});expect((cosigner as HTMLInputElement).value).toBe("");for(const [label,value]of [[/Cosigner/,"70"],[/· Agency \(%\)/,"10"],[/Rent2Go/,"10"],[/Maintenance reserve/,"10"]] as const)await user.type(screen.getByRole("textbox",{name:label}),value);expect(changed.mock.lastCall?.[0][0].shares).toEqual({cosigner:7000,agency:1000,platform:1000,maintenance:1000});expect(screen.getByText(/Total:100%|Total: 100%/)).toBeTruthy();
});
it("keeps nonexistent owner/reserve shares fixed at zero and omits rental-only tour charge combinations",async()=>{
 render(<Form changed={vi.fn()}/>);const user=userEvent.setup();await user.click(screen.getByRole("checkbox",{name:"Cancellation · Tour-only service"}));for(const label of [/Cancellation · Tour-only service · Cosigner/,/Cancellation · Tour-only service · Maintenance reserve/]){const input=screen.getByRole("textbox",{name:label}) as HTMLInputElement;expect(input.readOnly).toBe(true);expect(input.value).toBe("0");}expect(screen.queryByRole("checkbox",{name:"Fuel · Tour-only service"})).toBeNull();
});
it("preserves fractional percentages and marks excess precision as unset rather than silently rounding",async()=>{
 const changed=vi.fn();render(<Form changed={changed}/>);const user=userEvent.setup();await user.click(screen.getByRole("checkbox",{name:"Damage · Consigned rental"}));const input=screen.getByRole("textbox",{name:/Damage · Consigned rental · Cosigner/});await user.type(input,"70.25");expect(changed.mock.lastCall?.[0][0].shares.cosigner).toBe(7025);await user.type(input,"1");expect(input.getAttribute("aria-invalid")).toBe("true");expect(changed.mock.lastCall?.[0][0].shares.cosigner).toBeNull();
});
it("shows reviewers unset allocations separately from explicit zero and disclaims automatic deductions",()=>{
 render(<ExtraChargePolicySummary policies={[{type:"DAMAGE",context:"AGENCY_OWNED",explanation:"Human-reviewed documented damage only.",shares:{cosigner:0,agency:null,platform:null,maintenance:null}}]}/>);expect(screen.getByText("0%")).toBeTruthy();expect(screen.getAllByText("Not configured")).toHaveLength(3);expect(screen.getByText(/does not set an amount/)).toBeTruthy();
});
