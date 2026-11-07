// @vitest-environment jsdom
import React from 'react';
import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {PrivacyCaseReview} from '../../src/components/privacy-case';
import {PrivacyRequest} from '../../src/components/privacy-request';
import type {PrivacyCase} from '../../src/modules/governance/privacy';
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn(),push:vi.fn()})}));
const base={id:'case',kind:'DEACTIVATION',message:'Please close workspace access.',requesterId:'requester',requesterName:'Requester',version:1,status:'OPEN',digest:'exact-digest',createdAt:'2026-11-08T00:00:00Z',isOwn:false,canReview:true,canReply:false,canWithdraw:false,events:[],blockers:[],requestedName:null} as PrivacyCase;
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('discloses retained records and prevents approval with outstanding obligations',()=>{
 render(<PrivacyCaseReview initial={{...base,blockers:[{key:'bookings',count:1,message:'Finish or resolve existing bookings first.'}]}}/>);expect(screen.getByText(/not immediate data erasure/)).toBeTruthy();const approve=screen.getByRole('option',{name:'Approve and apply the disclosed outcome'}) as HTMLOptionElement;expect(approve.disabled).toBe(true);expect(screen.getByText(/Finish or resolve existing bookings/)).toBeTruthy();
});
it('requires fresh acknowledgment after the action or reason changes and reuses exact retry identity on an interrupted response',async()=>{
 const fetcher=vi.fn().mockRejectedValueOnce(Error('Connection interrupted')).mockResolvedValueOnce({ok:true,status:200,json:async()=>({...base,version:2,status:'REJECTED',canReview:false})});vi.stubGlobal('fetch',fetcher);render(<PrivacyCaseReview initial={base}/>);fireEvent.change(screen.getByLabelText('Privacy review action'),{target:{value:'REJECT'}});fireEvent.change(screen.getByLabelText('Review reason or reply'),{target:{value:'Exact retained-record explanation'}});const button=screen.getByRole('button',{name:'Save privacy action'});expect((button as HTMLButtonElement).disabled).toBe(true);fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(button);await screen.findByRole('alert');fireEvent.click(button);await screen.findByRole('status');expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
});
it('blocks a stale review until the saved case is refreshed and clears protected content after access denial',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce({ok:false,status:409,json:async()=>({error:'Request changed.'})}).mockResolvedValueOnce({ok:false,status:404,json:async()=>({error:'No access.'})});vi.stubGlobal('fetch',fetcher);render(<PrivacyCaseReview initial={base}/>);fireEvent.change(screen.getByLabelText('Privacy review action'),{target:{value:'REJECT'}});fireEvent.change(screen.getByLabelText('Review reason or reply'),{target:{value:'Exact reviewed reason'}});fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Save privacy action'}));await screen.findByRole('alert');expect((screen.getByRole('button',{name:'Save privacy action'}) as HTMLButtonElement).disabled).toBe(true);fireEvent.click(screen.getByRole('button',{name:'Refresh privacy request'}));await waitFor(()=>expect(screen.queryByText(base.message)).toBeNull());
});
it('limits a blocked account to appropriate requests and does not promise immediate removal',()=>{
 render(<PrivacyRequest suspended/>);expect(screen.getByRole('option',{name:'Account reactivation'})).toBeTruthy();expect(screen.queryByRole('option',{name:'Account deactivation'})).toBeNull();expect(screen.queryByRole('option',{name:'Privacy removal review'})).toBeNull();expect((screen.getByRole('button',{name:'Submit request for review'}) as HTMLButtonElement).disabled).toBe(true);
});
