// @vitest-environment jsdom
import React from 'react';
import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,cleanup,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../../src/components/closed-credits',()=>({OwnerClosedCredits:()=>null}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
import {OwnerAccount} from '../../src/components/owner-account';
const scope={agencyId:'c79318ab-a56e-4cc8-a8b0-a3e4676d7b36',ownerId:'owner',environment:'DEMO' as const},base={scope,accountId:null,requestVersion:1,agencyName:'Agency One',ownerName:'Synthetic owner',isOwner:true,isOperator:false,agencyActive:true,balances:{earnedCentavos:21000,availableCentavos:21000,requestedCentavos:0,reservedCentavos:0,paidCentavos:0,recoveryCentavos:0},canRequest:true,open:[],history:[],ledger:[],page:1,pageCount:1,ledgerPage:1,ledgerPageCount:1},reply=(body:unknown,status=200)=>({ok:status<400,status,json:async()=>body});
const item={id:scope.agencyId,amountCentavos:10000,method:'DEMO_GCASH',destination:{name:'Synthetic owner',account:'SAMPLE'},reason:'Synthetic request',createdAt:'2030-01-01T00:00:00Z',stage:'REQUESTED',reviewReason:null,cancellationReason:null,payoutId:null,canApprove:true,canReject:true,canWithdraw:false,canRevoke:false,canPay:false,attempts:[]};
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('requires exact decimal centavos and checked recipient details before requesting owner earnings',async()=>{
 const fetcher=vi.fn().mockResolvedValue(reply(base));vi.stubGlobal('fetch',fetcher);render(<OwnerAccount scope={scope}/>);const user=userEvent.setup(),button=await screen.findByRole('button',{name:'Request withdrawal'});await user.type(screen.getByLabelText('Withdrawal amount (PHP)'),'10.001');await user.type(screen.getByLabelText('Payout account or wallet'),'SAMPLE-WALLET');await user.type(screen.getByLabelText('Withdrawal reason'),'Synthetic available owner earnings');await user.click(screen.getByRole('checkbox'));expect((button as HTMLButtonElement).disabled).toBe(true);await user.clear(screen.getByLabelText('Withdrawal amount (PHP)'));await user.type(screen.getByLabelText('Withdrawal amount (PHP)'),'10.50');await user.click(button);await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({action:'REQUEST_WITHDRAWAL',amountCentavos:1050,version:1,destination:{name:'Synthetic owner',account:'SAMPLE-WALLET'}});expect(fetcher.mock.calls[1][0]).toContain('?environment=DEMO');expect(screen.getByText(/Unreviewed requests are queued/)).toBeTruthy();
});
it('requires independent review acknowledgment and keeps the identical approval on a lost-response retry',async()=>{
 const s={...base,isOwner:false,isOperator:true,canRequest:false,open:[item]},fetcher=vi.fn().mockResolvedValueOnce(reply(s)).mockRejectedValueOnce(Error('Connection lost')).mockResolvedValue(reply(s));vi.stubGlobal('fetch',fetcher);render(<OwnerAccount scope={scope}/>);const user=userEvent.setup(),button=await screen.findByRole('button',{name:'Approve and reserve'});await user.type(screen.getByLabelText('Action reason'),'Checked original owner allocation and destination');expect((button as HTMLButtonElement).disabled).toBe(true);await user.click(screen.getByRole('checkbox'));await user.click(button);await screen.findByRole('alert');await user.click(button);await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(3));expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[2][1].body);expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({action:'REVIEW_WITHDRAWAL',withdrawalId:item.id,decision:'APPROVE'});expect(screen.queryByRole('link',{name:'View saved payout record'})).toBeNull();
});
it('preserves a failed action reason and blocks stale decisions until refreshed',async()=>{
 const s={...base,isOwner:false,isOperator:true,canRequest:false,open:[item]},fetcher=vi.fn().mockResolvedValueOnce(reply(s)).mockResolvedValue(reply({error:'Owner account changed.'},409));vi.stubGlobal('fetch',fetcher);render(<OwnerAccount scope={scope}/>);const user=userEvent.setup(),button=await screen.findByRole('button',{name:'Reject request'});await user.type(screen.getByLabelText('Action reason'),'Correct the recipient details');await user.click(button);await screen.findByRole('alert');expect((screen.getByLabelText('Action reason') as HTMLTextAreaElement).value).toBe('Correct the recipient details');expect((button as HTMLButtonElement).disabled).toBe(true);expect(screen.getByText('Refresh the owner account before continuing.')).toBeTruthy();
});

it('identifies centrally held earnings separately and does not offer withdrawal controls',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(reply({...base,canRequest:false,balances:{...base.balances,centrallyHeldCentavos:21000,availableCentavos:0}})));render(<OwnerAccount scope={scope}/>);
 await screen.findByText('Held centrally for agency disbursement');expect(screen.queryByRole('button',{name:'Request withdrawal'})).toBeNull();expect(screen.getByText(/Amounts held by Rent2Go are excluded from withdrawals/)).toBeTruthy();
});

it('allows a non-success resolution when agency-held funds do not cover an old pending payout',async()=>{
 const attempt={id:'pending-attempt',outcome:'PENDING',reference:'SAMPLE',reason:'Existing pending outcome',createdAt:'2030-01-01T00:00:00Z',evidenceId:null,canResolve:true,canResolveSuccess:false};
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(reply({...base,isOwner:false,isOperator:true,canRequest:false,open:[{...item,stage:'APPROVED',canApprove:false,attempts:[attempt]}]})));render(<OwnerAccount scope={scope}/>);const user=userEvent.setup();
 const button=await screen.findByRole('button',{name:'Resolve payout simulation'});await user.type(screen.getByLabelText('Action reason'),'Record a failed attempt without changing funds');expect((button as HTMLButtonElement).disabled).toBe(true);await user.selectOptions(screen.getByLabelText('Pending payout result'),'FAILED');expect((button as HTMLButtonElement).disabled).toBe(false);
});
