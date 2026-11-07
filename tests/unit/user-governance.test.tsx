// @vitest-environment jsdom
import React from 'react';
import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {UserGovernance} from '../../src/components/user-governance';
import type {GovernanceUser} from '../../src/modules/governance/users';
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
const m=vi.hoisted(()=>({actor:vi.fn(),get:vi.fn(),change:vi.fn(),limit:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireActor:m.actor}));vi.mock('@/lib/rate-limit',()=>({rateLimit:m.limit}));vi.mock('@/modules/governance/users',()=>({getGovernanceUser:m.get,changeGovernanceUser:m.change}));
import {PATCH} from '../../src/app/api/governance/users/[id]/route';
const data={id:'user',name:'Account holder',role:'RENTER',suspended:false,version:1,digest:'exact',isSelf:false,history:[]} as GovernanceUser;
afterEach(()=>{cleanup();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.resetAllMocks();});
it('disables self review and states that another administrator is required',()=>{render(<UserGovernance initial={{...data,isSelf:true}}/>);expect(screen.queryByRole('button',{name:'Save reviewed account action'})).toBeNull();expect(screen.getByText(/Another active Super Admin must/)).toBeTruthy();});
it('requires the exact action and explanation to be acknowledged again after a role change',async()=>{
 const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({...data,role:'COSIGNER',version:2})});vi.stubGlobal('fetch',fetcher);render(<UserGovernance initial={data}/>);fireEvent.change(screen.getByLabelText('Account action'),{target:{value:'CHANGE_ROLE'}});fireEvent.change(screen.getByLabelText('Account action reason'),{target:{value:'Reviewed explicit role assignment'}});fireEvent.click(screen.getByRole('checkbox'));const button=screen.getByRole('button',{name:'Save reviewed account action'});expect((button as HTMLButtonElement).disabled).toBe(true);fireEvent.change(screen.getByLabelText('New account role'),{target:{value:'COSIGNER'}});expect((button as HTMLButtonElement).disabled).toBe(true);fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(button);await screen.findByRole('status');expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({action:'CHANGE_ROLE',role:'COSIGNER',version:1,digest:'exact',acknowledged:true});
});
it('explains preservation and limits of suspension rather than treating it as cancellation or deletion',()=>{render(<UserGovernance initial={data}/>);fireEvent.change(screen.getByLabelText('Account action'),{target:{value:'SUSPEND'}});expect(screen.getByText(/Existing bookings and funds are preserved/)).toBeTruthy();expect(screen.getByText(/Voluntary deactivation follows the separate/)).toBeTruthy();});
it('enforces mutation Origin before identity and never exposes a successful result on a denied change',async()=>{
 vi.stubEnv('APP_ORIGIN','http://localhost:3100');const request=(origin:string)=>new Request('http://localhost:3100/api/governance/users/user',{method:'PATCH',headers:{origin,'Content-Type':'application/json'},body:'{}'}),ctx={params:Promise.resolve({id:'user'})};expect((await PATCH(request('https://foreign.test'),ctx)).status).toBe(403);expect(m.actor).not.toHaveBeenCalled();
});
