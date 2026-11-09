// @vitest-environment jsdom
import React from 'react';
import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,cleanup,within} from '@testing-library/react';
const state=vi.hoisted(()=>({path:'/workspace',query:''}));vi.mock('next/navigation',()=>({usePathname:()=>state.path,useSearchParams:()=>new URLSearchParams(state.query)}));
import {WorkspaceSections} from '../../src/components/workspace-sections';
import {PartnershipGuide} from '../../src/components/partnership-guide';
afterEach(()=>{cleanup();state.path='/workspace';state.query='';});
it.each([['/workspace/vehicles/car','Vehicles'],['/workspace/resources/car','Calendars'],['/workspace/earnings/agency','Earnings'],['/workspace/reports','Reports']])('keeps %s inside one vehicle workspace', (path,label)=>{
 state.path=path;state.query='environment=DEMO';render(<WorkspaceSections/>);const nav=screen.getByRole('navigation',{name:'Vehicle workspace sections'});expect(within(nav).getAllByRole('link')).toHaveLength(4);expect(within(nav).getByRole('link',{name:label}).getAttribute('aria-current')).toBe('page');expect(within(nav).getByRole('link',{name:'Earnings'}).getAttribute('href')).toBe('/workspace/earnings?environment=DEMO');expect(within(nav).getByRole('link',{name:'Calendars'}).getAttribute('href')).toBe('/workspace/resources?environment=DEMO');expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
});
it('unifies security and privacy and selects saved privacy-request details correctly',()=>{
 state.path='/workspace/account';state.query='section=privacy';const view=render(<WorkspaceSections/>);expect(screen.getByRole('link',{name:'Privacy & requests'}).getAttribute('aria-current')).toBe('page');expect(screen.getByRole('link',{name:'Security'}).getAttribute('aria-current')).toBeNull();state.path='/account-status/privacy/request';state.query='';view.rerender(<WorkspaceSections/>);expect(screen.getByRole('link',{name:'Privacy & requests'}).getAttribute('aria-current')).toBe('page');
});
it('adds no unrelated section tabs to agency or booking workflows',()=>{state.path='/agency/example/bookings';const {container}=render(<WorkspaceSections/>);expect(container.textContent).toBe('');});
it('explains the six real application sections without creating or submitting a draft',()=>{
 render(<PartnershipGuide open/>);expect(screen.getAllByRole('listitem')).toHaveLength(6);for(const label of ['Business details','Services','Terms & policies','Pricing','Payments & shares','Review & submit'])expect(screen.getByText(label)).toBeTruthy();expect(screen.getByText(/Creating a draft does not submit/)).toBeTruthy();expect(screen.queryByRole('button')).toBeNull();
});
