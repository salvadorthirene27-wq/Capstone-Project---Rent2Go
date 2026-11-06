// @vitest-environment jsdom
import React from 'react';
import {afterEach,it,expect,vi} from 'vitest';
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
const {refresh}=vi.hoisted(()=>({refresh:vi.fn()}));vi.mock('next/navigation',()=>({useRouter:()=>({refresh})}));
vi.mock('../../src/components/settlement-payments',()=>({SettlementPayments:()=> <p>Separate balance payment controls</p>}));
import {BookingSettlement} from '../../src/components/booking-settlement';
const id='c79318ab-a56e-4cc8-a8b0-a3e4676d7b36',digest='a'.repeat(64);
function state(){return {requestId:id,requestVersion:4,status:'FULFILLMENT_RECONCILIATION_PENDING',isOwner:true,isOperator:false,blockedReason:null,canPropose:false,canClose:false,page:1,pageCount:1,history:[],funds:null,openWork:{payments:0,refunds:0},close:null,current:{id,revision:1,digest,reason:'Explicit fund disposition',createdAt:'2030-01-01T00:00:00Z',decision:null,decisionReason:null,stale:false,canAccept:true,canDispute:true,canWithdraw:false,terms:{environment:'DEMO',consentText:'I explicitly accept this exact fund disposition.',serviceCentavos:10000,extraCentavos:1000,obligationCentavos:11000,quotedDepositCentavos:20000,originalConfirmedCentavos:30000,originalRefundsCentavos:0,netHeldCentavos:30000,serviceAppliedCentavos:10000,extraAppliedCentavos:1000,refundDueCentavos:19000,additionalBalanceCentavos:0}}};}
const reply=(body:unknown,status=200)=>({ok:status<400,status,json:async()=>body});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks();});
it('requires separate exact disposition consent and does not treat it as a refund or closing',async()=>{
 const s=state(),fetcher=vi.fn().mockResolvedValueOnce(reply(s)).mockResolvedValue(reply({...s,current:{...s.current,decision:'ACCEPT',canAccept:false,canDispute:false}}));vi.stubGlobal('fetch',fetcher);render(<BookingSettlement requestId={id}/>);const user=userEvent.setup(),accept=await screen.findByRole('button',{name:'Accept settlement disposition'});expect((accept as HTMLButtonElement).disabled).toBe(true);await user.click(screen.getByRole('checkbox'));await user.click(accept);
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({action:'DECIDE_SETTLEMENT',settlementId:id,digest,version:4,decision:'ACCEPT',consent:true});expect(screen.queryByText('Financial record closed')).toBeNull();expect(screen.getByText('Separate balance payment controls')).toBeTruthy();
});
it('preserves a failed dispute reason and disables decisions until a conflict is refreshed',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(reply(state())).mockResolvedValueOnce(reply({error:'Financial facts changed.'},409));vi.stubGlobal('fetch',fetcher);render(<BookingSettlement requestId={id}/>);const user=userEvent.setup(),button=await screen.findByRole('button',{name:'Dispute settlement'});await user.type(screen.getByLabelText('Settlement review reason'),'Recheck the recorded refund.');await user.click(button);expect((await screen.findByRole('alert')).textContent).toContain('facts changed');expect((screen.getByLabelText('Settlement review reason') as HTMLTextAreaElement).value).toBe('Recheck the recorded refund.');expect((button as HTMLButtonElement).disabled).toBe(true);
});
it('makes the final agency action distinct and prevents an accidental close without review',async()=>{
 const s=state(),agency={...s,isOwner:false,isOperator:true,canClose:true,current:{...s.current,decision:'ACCEPT',canAccept:false,canDispute:false}};const fetcher=vi.fn().mockResolvedValue(reply(agency));vi.stubGlobal('fetch',fetcher);render(<BookingSettlement requestId={id}/>);const user=userEvent.setup(),close=await screen.findByRole('button',{name:'Close financial record'});expect((close as HTMLButtonElement).disabled).toBe(true);await user.type(screen.getByLabelText('Settlement explanation'),'Checked current funds and accepted allocations.');expect((close as HTMLButtonElement).disabled).toBe(true);await user.click(screen.getByRole('checkbox'));await user.click(close);await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({action:'CLOSE_FINANCIAL_RECORD',version:4,settlementId:id,digest});
});

it('keeps additional collection history accessible after financial closing',async()=>{
 const s=state(),closed={...s,current:{...s.current,decision:'ACCEPT',canAccept:false,canDispute:false},close:{id,digest,outcome:'DELIVERED',totalCentavos:11000,createdAt:'2030-01-02T00:00:00Z'}};
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(reply(closed)));render(<BookingSettlement requestId={id}/>);
 expect(await screen.findByRole('heading',{name:'Financial record closed'})).toBeTruthy();expect(screen.getByText('Separate balance payment controls')).toBeTruthy();expect(screen.queryByRole('button',{name:'Close financial record'})).toBeNull();
});
