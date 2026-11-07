// @vitest-environment jsdom
import React from 'react';
import {afterEach,it,expect,vi} from 'vitest';
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Inbox} from '../../src/components/notification-inbox';
import type {NotificationInbox} from '../../src/modules/notifications/service';
const unread={id:'c79318ab-a56e-4cc8-a8b0-a3e4676d7b36',source:'BOOKING' as const,message:'A saved booking update',createdAt:'2026-11-07T00:00:00Z',readAt:null,link:'/workspace/bookings/c79318ab-a56e-4cc8-a8b0-a3e4676d7b36'},initial:NotificationInbox={filters:{status:'ALL',category:'ALL',page:1},unread:2,total:2,pageCount:1,preparedAt:'2026-11-07T00:00:00Z',items:[unread,{...unread,id:'4f15cfa3-4d96-48c7-a454-12a57b3092a0',source:'FINANCE',message:'Source access changed.',link:null}]},reply=(body:unknown,ok=true)=>({ok,json:async()=>body});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('marks only the visible delivered IDs, prevents duplicate requests and focuses the saved read feedback',async()=>{
 let resolve!:(v:unknown)=>void;const fetcher=vi.fn((_input:unknown,_init:RequestInit)=>new Promise(r=>{resolve=r;}));vi.stubGlobal('fetch',fetcher);render(<Inbox initial={initial}/>);const user=userEvent.setup();await user.dblClick(screen.getByRole('button',{name:'Mark this page as read'}));expect(fetcher).toHaveBeenCalledTimes(1);expect(JSON.parse(String(fetcher.mock.calls[0][1].body))).toEqual({items:initial.items.map(n=>({source:n.source,id:n.id})),query:initial.filters});
 resolve(reply({...initial,unread:0,items:initial.items.map(n=>({...n,readAt:'2026-11-07T00:01:00Z'}))}));const status=await screen.findByRole('status');await waitFor(()=>expect(document.activeElement).toBe(status));expect(status.textContent).toBe('2 updates marked as read.');expect(screen.queryByRole('button',{name:'Mark as read'})).toBeNull();
});
it('keeps loaded labels and updates after a failed filter refresh instead of displaying them under the requested filter',async()=>{
 const fetcher=vi.fn().mockResolvedValue(reply({error:'Connection unavailable'},false));vi.stubGlobal('fetch',fetcher);render(<Inbox initial={initial}/>);const user=userEvent.setup();await user.selectOptions(screen.getByLabelText('Update category'),'VEHICLE');expect((await screen.findByRole('alert')).textContent).toContain('last loaded updates remain');expect((screen.getByLabelText('Update category') as HTMLSelectElement).value).toBe('ALL');expect(screen.getByText('A saved booking update')).toBeTruthy();expect(screen.queryByRole('link',{name:'Open saved workspace'})).toBeTruthy();expect(screen.getByText('Source details are currently unavailable to this account.')).toBeTruthy();
});
it('announces fresh visible-page updates without marking them read or moving keyboard focus',async()=>{
 const fetcher=vi.fn().mockResolvedValue(reply({...initial,unread:3}));vi.stubGlobal('fetch',fetcher);render(<Inbox initial={initial}/>);const control=screen.getByLabelText('Show updates');control.focus();window.dispatchEvent(new Event('focus'));await waitFor(()=>expect(screen.getByRole('status').textContent).toBe('New unread updates are available.'));expect(document.activeElement).toBe(control);expect(fetcher.mock.calls[0][1].method).toBeUndefined();expect(screen.getAllByRole('button',{name:'Mark as read'})).toHaveLength(2);
});
it('aborts a pending request on unmount and displays an honest unread empty state',async()=>{
 const fetcher=vi.fn((_input:unknown,_init:RequestInit)=>new Promise(()=>{}));vi.stubGlobal('fetch',fetcher);const view=render(<Inbox initial={{...initial,filters:{...initial.filters,status:'UNREAD'},unread:0,total:0,items:[]}}/>);expect(screen.getByRole('heading',{name:'You’re caught up'})).toBeTruthy();expect((screen.getByRole('button',{name:'Mark this page as read'}) as HTMLButtonElement).disabled).toBe(true);await userEvent.setup().click(screen.getByRole('button',{name:'Refresh updates'}));view.unmount();expect(fetcher.mock.calls[0][1].signal?.aborted).toBe(true);
});
