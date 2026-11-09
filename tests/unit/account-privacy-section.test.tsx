// @vitest-environment jsdom
import React from 'react';
import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
const m=vi.hoisted(()=>({cases:vi.fn(),history:vi.fn()}));vi.mock('@/modules/governance/privacy',()=>({getPrivacyCases:m.cases,getOwnAccessHistory:m.history}));vi.mock('@/components/privacy-request',()=>({PrivacyRequest:({suspended}:any)=><p>{suspended?'Limited requests':'Account requests'}</p>}));
import {AccountPrivacy} from '../../src/components/account-privacy';
const user={id:'person',name:'Person',email:'person@example.test',role:'RENTER',suspended:false,version:1};afterEach(()=>{cleanup();vi.resetAllMocks();});
it('keeps privacy filters and pagination inside Account while preserving saved request links',async()=>{
 m.cases.mockResolvedValue({view:'ALL',page:2,pageCount:3,items:[{id:'request',kind:'ACCESS',status:'OPEN',updatedAt:'2030-01-01T00:00:00Z'}]});m.history.mockResolvedValue([]);render(await AccountPrivacy({user,query:{view:'ALL',page:2}}));expect(screen.getByRole('link',{name:'Next'}).getAttribute('href')).toBe('/workspace/account?section=privacy&view=ALL&page=3');expect(screen.getByRole('link',{name:'Open requests'}).getAttribute('href')).toContain('section=privacy');expect(screen.getByRole('link',{name:'View saved privacy request'}).getAttribute('href')).toBe('/account-status/privacy/request');expect(m.cases).toHaveBeenCalledWith(user,{view:'ALL',page:2});
});
it('keeps restricted account request navigation outside the active workspace',async()=>{
 m.cases.mockResolvedValue({view:'OPEN',page:1,pageCount:1,items:[]});m.history.mockResolvedValue([]);render(await AccountPrivacy({user:{...user,suspended:true},query:{},limited:true}));expect(screen.getByRole('heading',{name:'Workspace access is unavailable'})).toBeTruthy();expect(screen.getByRole('link',{name:'All requests'}).getAttribute('href')).toBe('/account-status?view=ALL&page=1');expect(screen.getByText('Limited requests')).toBeTruthy();
});
