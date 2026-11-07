// @vitest-environment jsdom
import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,cleanup,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {ClosedCreditReview,OwnerClosedCredits} from '../../src/components/closed-credits';
import type {ClosedCreditState} from '../../src/modules/accounting/closed-credits';
const state={id:'credit',requestId:null,requestVersion:4,environment:'DEMO',title:'Owner vehicle',reason:'Accepted service credit',createdAt:'2030-01-01T00:00:00Z',postedAt:null,withdrawnReason:null,isOwner:true,isRenter:false,isOperator:false,backHref:'/workspace/earnings/agency',digest:'owner-digest',terms:{title:'Owner vehicle',agencyName:'Synthetic agency',sourceKind:'EXTRA',sourceReference:'source',startAt:'2030-01-01T00:00:00Z',endAt:'2030-01-02T00:00:00Z',originalShareBps:7000,previousReductionsCentavos:0,originalEarningsCentavos:21000,reductionCentavos:14000,consentText:'I accept this earnings reduction and future recovery.'},allocations:null,decisions:[],renterDecision:null,ownerDecision:null,canDecide:true,canWithdraw:false,canPost:false,ownerAcceptanceRequired:false,ownerAccepted:false,roundingRule:'Exact original centavos'} as ClosedCreditState;
const reply=(data:unknown,status=200)=>({ok:status<400,status,json:async()=>data});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('requires explicit Cosigner acknowledgment and preserves the exact retry key after an ambiguous response',async()=>{
 const fetcher=vi.fn().mockRejectedValueOnce(Error('Connection interrupted')).mockResolvedValue(reply({...state,requestVersion:5,canDecide:false,decisions:[{party:'OWNER',decision:'ACCEPT',reason:'',createdAt:state.createdAt}]}));vi.stubGlobal('fetch',fetcher);
 render(<ClosedCreditReview initial={state}/>);const user=userEvent.setup(),button=screen.getByRole('button',{name:'Accept earnings reduction and future recovery'});expect((button as HTMLButtonElement).disabled).toBe(true);
 await user.click(screen.getByRole('checkbox'));await user.click(button);await screen.findByRole('alert');await user.click(button);await screen.findByText('Credit action saved.');
 const first=JSON.parse(fetcher.mock.calls[0][1].body),second=JSON.parse(fetcher.mock.calls[1][1].body);expect(second).toEqual(first);expect(first).toMatchObject({action:'DECIDE_CREDIT',version:4,creditId:'credit',digest:'owner-digest',decision:'ACCEPT',consent:true});expect(screen.queryByText(/Agency accounting allocation/)).toBeNull();
});
it('requires a dispute reason and blocks stale decisions until the saved credit has been reloaded',async()=>{
 const fetcher=vi.fn().mockResolvedValue(reply({error:'This credit changed.'},409));vi.stubGlobal('fetch',fetcher);render(<ClosedCreditReview initial={state}/>);const user=userEvent.setup(),button=screen.getByRole('button',{name:'Dispute these terms'});expect((button as HTMLButtonElement).disabled).toBe(true);await user.type(screen.getByLabelText('Review reason'),'I dispute this recovery.');await user.click(button);await screen.findByRole('alert');expect((button as HTMLButtonElement).disabled).toBe(true);expect(screen.getByText('Reload the saved credit before taking another action.')).toBeTruthy();
});
it('shows owner-only reductions and predictable paging in the earnings workspace',async()=>{
 const fetcher=vi.fn().mockResolvedValue(reply({page:1,pageCount:2,items:[{id:'credit',title:'My vehicle',amountCentavos:14000,reason:'Exact owner portion',createdAt:state.createdAt,stage:'AWAITING YOUR REVIEW'}]}));vi.stubGlobal('fetch',fetcher);render(<OwnerClosedCredits scope={{agencyId:'agency',ownerId:'owner',environment:'DEMO'}}/>);await screen.findByRole('link',{name:'Review your saved credit terms'});expect(screen.getByText('₱140.00')).toBeTruthy();const user=userEvent.setup();await user.click(screen.getByRole('button',{name:'Next credits'}));await waitFor(()=>expect(fetcher.mock.calls.at(-1)?.[0]).toContain('page=2'));
});
