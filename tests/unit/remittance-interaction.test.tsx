// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {render,screen,cleanup,fireEvent,within} from '@testing-library/react';
import {RemittanceAccount} from '../../src/components/remittance-account';
const mock=vi.hoisted(()=>({state:null as any,send:vi.fn(),load:vi.fn()}));
vi.mock('../../src/components/use-remittance-account',()=>({useRemittanceAccount:()=>({...mock.state,send:mock.send,load:mock.load})}));
const scope={agencyId:'365ef66a-beec-48fd-88c7-13245a359e31',environment:'DEMO' as const};
const source={entryId:'source-one',title:'Island tour',sourceKind:'SERVICE',closedAt:'2026-11-08T00:00:00Z',dueCentavos:3000,originalCentavos:3000,creditCentavos:0,paidCentavos:0,offsetCentavos:0,reservedCentavos:0,platformBps:1000,originalSettlementSchedule:'WEEKLY',originalPaymentPreference:'DEMO_GCASH'};
function data(){return {scope,agencyName:'Example travel agency',agencyActive:true,balances:{dueCentavos:3000,reservedCentavos:0,paidCentavos:0,availableCreditCentavos:0,awaitingAcceptanceCentavos:0,offsetCentavos:0},sources:{items:[source],page:1,pageCount:1,digest:'sources-a'},availableCredits:{items:[],digest:'credits-a'},maxRequestCentavos:3000,maxApplyCentavos:0,canRequest:true,canApplyCredit:false,open:[],creditSources:{items:[],page:1,pageCount:1},history:[],historyPage:1,historyPageCount:1,creditHistory:[],creditHistoryPage:1,creditHistoryPageCount:1};}
beforeEach(()=>{mock.send.mockReset().mockResolvedValue(false);mock.state={data:data(),loading:false,busy:false,blocked:false,stale:false,error:'',message:''};});
afterEach(cleanup);
it('requires exact source disclosure and acknowledgment again when amount or source facts change',()=>{
 const view=render(<RemittanceAccount scope={scope}/>),button=screen.getByRole('button',{name:'Prepare remittance and reserve sources'}),amount=screen.getByLabelText('Remittance amount (PHP)');
 fireEvent.change(amount,{target:{value:'20.00'}});fireEvent.change(screen.getByLabelText('Remittance reason'),{target:{value:'Settle agreed platform commission'}});expect((button as HTMLButtonElement).disabled).toBe(true);
 const preview=screen.getByRole('heading',{name:'Sources covered by this amount'}).parentElement!;expect(preview.textContent).toContain('Island tour');expect(preview.textContent).toContain('20.00');
 fireEvent.click(screen.getByRole('checkbox'));expect((button as HTMLButtonElement).disabled).toBe(false);
 fireEvent.change(amount,{target:{value:'21.00'}});expect((button as HTMLButtonElement).disabled).toBe(true);fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(button);expect(mock.send).toHaveBeenCalledWith(expect.objectContaining({action:'REQUEST_REMITTANCE',amountCentavos:2100,sourceDigest:'sources-a',consent:true}));
 mock.state.data={...mock.state.data,sources:{...mock.state.data.sources,digest:'sources-b'}};view.rerender(<RemittanceAccount scope={scope}/>);expect((button as HTMLButtonElement).disabled).toBe(true);
});
it('never offers to spend an unaccepted excess and requires explicit agency acceptance',()=>{
 const d=mock.state.data;d.canRequest=false;d.balances.awaitingAcceptanceCentavos=3000;d.creditSources.items=[{digest:'exact-credit',canAccept:true,body:{source:{...source,originalCentavos:3000,creditCentavos:3000,paidCentavos:3000},amountCentavos:3000,consentText:'This exact credit can cover future remittances after acceptance.'}}];
 render(<RemittanceAccount scope={scope}/>);expect(screen.queryByRole('button',{name:'Apply accepted credit'})).toBeNull();const button=screen.getByRole('button',{name:'Accept agency credit for future remittances'});expect((button as HTMLButtonElement).disabled).toBe(true);fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(button);expect(mock.send).toHaveBeenCalledWith({action:'ACCEPT_AGENCY_CREDIT',entryId:'source-one',creditDigest:'exact-credit',consent:true});
});
it('keeps an agency external-payment claim separate from independent receipt confirmation',()=>{
 const d=mock.state.data;d.canRequest=false;d.open=[{id:'request',digest:'request-digest',amountCentavos:3000,environment:'MANUAL',method:'CASH',reason:'Original commission',createdAt:source.closedAt,stage:'AWAITING_PAYMENT',canSubmitProof:true,attempts:[],attemptCount:0}];
 render(<RemittanceAccount scope={scope}/>);expect(screen.queryByRole('button',{name:'Confirm actual receipt'})).toBeNull();const button=screen.getByRole('button',{name:'Submit payment claim for receipt review'});
 fireEvent.change(screen.getByLabelText('External remittance reference'),{target:{value:'REFERENCE-123'}});fireEvent.change(screen.getByLabelText('Payment claim note'),{target:{value:'External payment to review'}});const file=new File(['proof'],'proof.png',{type:'image/png'});fireEvent.change(screen.getByLabelText('Private remittance proof'),{target:{files:[file]}});expect((button as HTMLButtonElement).disabled).toBe(true);fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(button);expect(mock.send).toHaveBeenCalledWith(expect.objectContaining({action:'SUBMIT_REMITTANCE_PROOF',externalPaid:true,reference:'REFERENCE-123'}),file);
 fireEvent.change(screen.getByLabelText('External remittance reference'),{target:{value:'CORRECTED-REFERENCE'}});expect((button as HTMLButtonElement).disabled).toBe(true);
});
it('requires independent actual-receipt attestation and offers a reasoned rejection without it',()=>{
 const d=mock.state.data;d.canRequest=false;d.open=[{id:'request',digest:'request-digest',amountCentavos:3000,environment:'MANUAL',method:'CASH',reason:'Original commission',createdAt:source.closedAt,stage:'PENDING',pendingAttemptId:'attempt',attempts:[{id:'attempt',outcome:'SUBMITTED',createdAt:source.closedAt,reference:'REF',note:'A claim only',canReview:true}],attemptCount:1}];
 render(<RemittanceAccount scope={scope}/>);const accept=screen.getByRole('button',{name:'Confirm actual receipt'}),reject=screen.getByRole('button',{name:'Reject payment claim with reason'});fireEvent.change(screen.getByLabelText('Platform payment review reason'),{target:{value:'Matched the external platform receipt'}});expect((accept as HTMLButtonElement).disabled).toBe(true);expect((reject as HTMLButtonElement).disabled).toBe(false);fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(accept);expect(mock.send).toHaveBeenCalledWith(expect.objectContaining({action:'REVIEW_REMITTANCE',attemptId:'attempt',decision:'ACCEPT',externalReceived:true}));
});
