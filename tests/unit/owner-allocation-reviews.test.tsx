// @vitest-environment jsdom
import React from 'react';
import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,cleanup,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
const {refresh}=vi.hoisted(()=>({refresh:vi.fn()}));vi.mock('next/navigation',()=>({useRouter:()=>({refresh})}));
import {OwnerAllocationReviews} from '../../src/components/vehicles/owner-allocation-reviews';
const id='e79318ab-a56e-4cc8-a8b0-a3e4676d7b36',shares={cosigner:7000,agency:1000,platform:1000,maintenance:1000};
const item={assessmentId:id,assessmentRevision:1,requestVersion:4,digest:'a'.repeat(64),isCurrent:true,decision:null,reason:null,reviewedAt:null,blockedReason:null,canAccept:true,canDispute:true,packet:{environment:'DEMO',agencyName:'Synthetic Agency',lines:[{lineId:id,title:'Own car',startAt:'2030-01-01T00:00:00Z',endAt:'2030-01-02T00:00:00Z',netServiceCentavos:10000,originalServiceShares:shares}],charges:[{id,lineId:id,amountCentavos:1000,reason:'Documented extra charge',policy:{type:'DAMAGE',revision:1,explanation:'Exact allocation',shares}}]}};
const state={offerId:id,scope:'OPEN',page:1,pageCount:1,total:1,items:[item]},reply=(body:unknown,status=200)=>({ok:status<400,status,json:async()=>body});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks();});
it('requires owner consent and sends only the exact saved assessment, digest and booking version',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(reply(state)).mockResolvedValueOnce(reply({...item,decision:'ACCEPT'})).mockResolvedValue(reply({...state,items:[]}));vi.stubGlobal('fetch',fetcher);render(<OwnerAllocationReviews offerId={id}/>);const user=userEvent.setup(),accept=await screen.findByRole('button',{name:'Accept vehicle allocation'});
 expect((accept as HTMLButtonElement).disabled).toBe(true);await user.click(screen.getByRole('checkbox'));await user.click(accept);
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(3));expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({action:'REVIEW_OWNER_ALLOCATION',assessmentId:id,digest:item.digest,version:4,decision:'ACCEPT',consent:true});expect(fetcher.mock.calls[1][1].body).not.toContain('shares');expect(await screen.findByText(/Vehicle allocation accepted/)).toBeTruthy();
});
it('requires a dispute reason and blocks further decisions until refresh on a conflict',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(reply(state)).mockResolvedValueOnce(reply({error:'This booking changed.'},409));vi.stubGlobal('fetch',fetcher);render(<OwnerAllocationReviews offerId={id}/>);const user=userEvent.setup(),dispute=await screen.findByRole('button',{name:'Dispute vehicle allocation'});expect((dispute as HTMLButtonElement).disabled).toBe(true);
 await user.type(screen.getByLabelText('Owner review reason'),'Correct these shares.');await user.click(dispute);expect((await screen.findByRole('alert')).textContent).toContain('booking changed');expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({decision:'DISPUTE',consent:false,reason:'Correct these shares.'});expect((dispute as HTMLButtonElement).disabled).toBe(true);expect(refresh).not.toHaveBeenCalled();
});
it('preserves the exact retry key after a lost response without claiming the action succeeded',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(reply(state)).mockRejectedValueOnce(Error('Connection lost')).mockResolvedValueOnce(reply({...item,decision:'ACCEPT'})).mockResolvedValue(reply({...state,items:[]}));vi.stubGlobal('fetch',fetcher);render(<OwnerAllocationReviews offerId={id}/>);const user=userEvent.setup(),accept=await screen.findByRole('button',{name:'Accept vehicle allocation'});await user.click(screen.getByRole('checkbox'));await user.click(accept);expect(await screen.findByRole('alert')).toBeTruthy();expect(screen.queryByText(/Vehicle allocation accepted/)).toBeNull();await user.click(accept);await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(4));expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[2][1].body);
});
it('keeps a confirmed decision out of the pending queue even if the following refresh fails',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(reply(state)).mockResolvedValueOnce(reply({...item,decision:'ACCEPT'})).mockRejectedValueOnce(Error('Refresh temporarily unavailable'));vi.stubGlobal('fetch',fetcher);render(<OwnerAllocationReviews offerId={id}/>);const user=userEvent.setup(),accept=await screen.findByRole('button',{name:'Accept vehicle allocation'});await user.click(screen.getByRole('checkbox'));await user.click(accept);
 expect(await screen.findByText(/Vehicle allocation accepted/)).toBeTruthy();expect((await screen.findByRole('alert')).textContent).toContain('Refresh temporarily unavailable');expect(screen.queryByRole('button',{name:'Accept vehicle allocation'})).toBeNull();expect(screen.getByText('No vehicle allocations are awaiting your review.')).toBeTruthy();
});
