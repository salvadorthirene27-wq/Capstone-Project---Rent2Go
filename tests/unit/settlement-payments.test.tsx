// @vitest-environment jsdom
import React from 'react';
import {afterEach,it,expect,vi} from 'vitest';
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
import {SettlementPayments} from '../../src/components/settlement-payments';
const id='c79318ab-a56e-4cc8-a8b0-a3e4676d7b36',s={requestId:id,requestVersion:8,isOwner:true,isOperator:false,settlement:{id,digest:'a'.repeat(64),revision:1,environment:'DEMO'},balanceCentavos:5000,blockedReason:null,methods:['DEMO_CARD'],instructions:{},canRecordCash:false,canSubmitGcash:false,canSimulate:true,open:[],history:[],page:1,pageCount:1},reply=(body:unknown,status=200)=>({ok:status<400,status,json:async()=>body});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('keeps simulations labeled and repeats the identical command after a lost response',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(reply(s)).mockRejectedValueOnce(Error('Connection lost')).mockResolvedValueOnce(reply({...s,balanceCentavos:0,canSimulate:false}));vi.stubGlobal('fetch',fetcher);render(<SettlementPayments requestId={id}/>);const user=userEvent.setup(),button=await screen.findByRole('button',{name:'Record simulated balance result'});expect(screen.getByText(/Simulated balance payment · no charge/)).toBeTruthy();await user.click(button);expect(await screen.findByRole('alert')).toBeTruthy();await user.click(button);await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(3));expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[2][1].body);expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({action:'SIMULATE_PAYMENT',settlementId:id,digest:s.settlement.digest,version:8,method:'DEMO_CARD'});
});
it('requires a positive exact cash amount, reference, note and received-cash acknowledgment',async()=>{
 const fetcher=vi.fn().mockResolvedValue(reply({...s,isOwner:false,isOperator:true,settlement:{...s.settlement,environment:'MANUAL'},canSimulate:false,canRecordCash:true,methods:['CASH']}));vi.stubGlobal('fetch',fetcher);render(<SettlementPayments requestId={id}/>);const user=userEvent.setup(),button=await screen.findByRole('button',{name:'Record balance cash'});await user.type(screen.getByLabelText('Cash amount (PHP)'),'10.001');await user.type(screen.getByLabelText('Cash reference'),'BALANCE-CASH-1');await user.type(screen.getByLabelText('Collection note'),'Exact received amount checked.');await user.click(screen.getByRole('checkbox'));expect((button as HTMLButtonElement).disabled).toBe(true);await user.clear(screen.getByLabelText('Cash amount (PHP)'));await user.type(screen.getByLabelText('Cash amount (PHP)'),'10.50');await user.click(button);await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({action:'RECORD_CASH',amountCentavos:1050,settlementId:id});
});
