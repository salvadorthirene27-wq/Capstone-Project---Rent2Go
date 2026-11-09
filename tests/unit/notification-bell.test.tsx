// @vitest-environment jsdom
import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,cleanup,waitFor,act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
const state=vi.hoisted(()=>({path:'/workspace'}));
vi.mock('../../src/components/notification-panel',()=>({NotificationPanel:({close}:{close:()=>void})=><section role="dialog"><button onClick={close}>Close notifications</button></section>}));
vi.mock('next/navigation',()=>({usePathname:()=>state.path}));
import {NotificationBell} from '../../src/components/notification-bell';
const reply=(unread:number,actorId='person',status=200)=>({ok:status<400,status,json:async()=>({actorId,unread})});
beforeEach(()=>{vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();state.path='/workspace';});
it('shows a red unread indicator with an accessible count and opens the inbox without marking anything read',async()=>{
 const fetcher=vi.fn().mockResolvedValue(reply(3)),navigate=vi.fn();vi.stubGlobal('fetch',fetcher);render(<NotificationBell userId="person" onNavigate={navigate}/>);
 const link=await screen.findByRole('button',{name:'Notifications (3 unread)'});expect(link.getAttribute('aria-haspopup')).toBe('dialog');expect(link.querySelector('.notification-dot')?.getAttribute('aria-hidden')).toBe('true');link.addEventListener('click',e=>e.preventDefault());await userEvent.setup().click(link);expect(navigate).toHaveBeenCalledOnce();expect(screen.getByRole('dialog')).toBeTruthy();await userEvent.setup().keyboard('{Escape}');expect(screen.queryByRole('dialog')).toBeNull();expect(document.activeElement).toBe(link);expect(fetcher.mock.calls.every(([,init])=>!init.method)).toBe(true);
});
it('clears the dot after confirmed read updates without moving keyboard focus',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(reply(2)).mockResolvedValue(reply(0));vi.stubGlobal('fetch',fetcher);render(<><NotificationBell userId="person"/><input aria-label="Other task"/></>);await screen.findByRole('button',{name:'Notifications (2 unread)'});const input=screen.getByRole('textbox');input.focus();act(()=>window.dispatchEvent(new Event('rent2go:notifications-changed')));const link=await screen.findByRole('button',{name:'Notifications (all read)'});expect(link.querySelector('.notification-dot')).toBeNull();expect(document.activeElement).toBe(input);
});
it('ignores an older account response after a session switch and refuses a mismatched actor count',async()=>{
 let old!:(v:unknown)=>void;const fetcher=vi.fn().mockImplementationOnce(()=>new Promise(r=>{old=r;})).mockResolvedValue(reply(4,'new'));vi.stubGlobal('fetch',fetcher);const view=render(<NotificationBell userId="old"/>);view.rerender(<NotificationBell userId="new"/>);await screen.findByRole('button',{name:'Notifications (4 unread)'});await act(async()=>old(reply(9,'old')));expect(screen.queryByRole('button',{name:'Notifications (9 unread)'})).toBeNull();
 fetcher.mockResolvedValue(reply(6,'foreign'));act(()=>window.dispatchEvent(new Event('focus')));await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(3));expect(screen.getByRole('button',{name:'Notifications (4 unread)'})).toBeTruthy();
});
it('retains a confirmed count through a connection failure and clears private state after access expires',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(reply(2)).mockRejectedValueOnce(Error('offline')).mockResolvedValue(reply(0,'person',401));vi.stubGlobal('fetch',fetcher);render(<NotificationBell userId="person"/>);await screen.findByRole('button',{name:'Notifications (2 unread)'});await act(async()=>{window.dispatchEvent(new Event('focus'));});expect(screen.getByRole('button',{name:'Notifications (2 unread)'})).toBeTruthy();act(()=>window.dispatchEvent(new Event('focus')));await screen.findByRole('button',{name:'Notifications'});expect(document.querySelector('.notification-dot')).toBeNull();
});
it('waits while hidden, avoids overlapping requests and aborts a pending request on unmount',async()=>{
 vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');const fetcher=vi.fn((_url,init:RequestInit)=>new Promise(()=>{}));vi.stubGlobal('fetch',fetcher);const view=render(<NotificationBell userId="person"/>);expect(fetcher).not.toHaveBeenCalled();vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');act(()=>{document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));});expect(fetcher).toHaveBeenCalledTimes(1);view.unmount();expect(fetcher.mock.calls[0][1].signal?.aborted).toBe(true);
});
it('refreshes visible counts every30seconds and responds to another tab recording reads',async()=>{
 vi.useFakeTimers();const fetcher=vi.fn().mockResolvedValue(reply(1));vi.stubGlobal('fetch',fetcher);render(<NotificationBell userId="person"/>);await act(async()=>{});await act(async()=>{await vi.advanceTimersByTimeAsync(30000);});expect(fetcher).toHaveBeenCalledTimes(2);fetcher.mockResolvedValue(reply(0));await act(async()=>{window.dispatchEvent(new StorageEvent('storage',{key:'rent2go:notification-read'}));});expect(screen.getByRole('button',{name:'Notifications (all read)'})).toBeTruthy();
});
