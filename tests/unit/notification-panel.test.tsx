// @vitest-environment jsdom
import React from 'react';
import {afterEach,it,expect,vi} from 'vitest';
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {NotificationPanel} from '../../src/components/notification-panel';
const item={source:'BOOKING',id:'c79318ab-a56e-4cc8-a8b0-a3e4676d7b36',message:'Your quotation is ready.',createdAt:'2026-11-07T00:00:00Z',readAt:null,link:'/workspace/bookings/request'};
const inbox={filters:{status:'ALL',category:'ALL',page:1},unread:45,total:45,pageCount:3,items:[item]};
const response=(body:unknown,ok=true,status=200)=>({ok,status,json:async()=>body});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('opens without recording reads, focuses close and sends a global mark-all command rather than visible IDs',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(response(inbox)).mockResolvedValue(response({inbox:{...inbox,unread:0},affected:45,undoId:null}));vi.stubGlobal('fetch',fetcher);render(<NotificationPanel close={vi.fn()}/>);
 await screen.findByText(item.message);expect(document.activeElement).toBe(screen.getByRole('button',{name:'Close notifications'}));expect(fetcher).toHaveBeenCalledTimes(1);await userEvent.setup().click(screen.getByRole('button',{name:'Mark all as read'}));
 await screen.findByText('45 notifications marked as read.');const command=JSON.parse(fetcher.mock.calls[1][1].body);expect(command.action).toBe('MARK_ALL_READ');expect(command.items).toBeUndefined();expect(command.idempotencyKey).toMatch(/^[a-f0-9-]{36}$/);
});
it('deletes only read notifications through the dedicated server command, exposes Undo and a recoverable Deleted filter',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(response(inbox)).mockResolvedValueOnce(response({inbox,affected:2,undoId:'batch'})).mockResolvedValueOnce(response({inbox,affected:2,undoId:null})).mockResolvedValue(response({...inbox,filters:{...inbox.filters,status:'DELETED'},items:[item]}));vi.stubGlobal('fetch',fetcher);render(<NotificationPanel close={vi.fn()}/>);await screen.findByText(item.message);const user=userEvent.setup();await user.click(screen.getByRole('button',{name:'Delete read'}));await screen.findByText('2 notifications deleted.');expect(JSON.parse(fetcher.mock.calls[1][1].body).action).toBe('DELETE_READ');await user.click(screen.getByRole('button',{name:'Undo'}));await screen.findByText('2 notifications restored.');expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({action:'RESTORE_BATCH',batchId:'batch'});await user.click(screen.getByRole('button',{name:'Deleted'}));expect(await screen.findByRole('button',{name:'Restore'})).toBeTruthy();expect(screen.queryByRole('button',{name:'Delete read'})).toBeNull();
});
it('preserves the exact retry key after an ambiguous deletion and never reports false success',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(response(inbox)).mockRejectedValueOnce(Error('Connection lost')).mockResolvedValue(response({inbox,affected:1,undoId:'batch'}));vi.stubGlobal('fetch',fetcher);render(<NotificationPanel close={vi.fn()}/>);await screen.findByText(item.message);const user=userEvent.setup();await user.click(screen.getByRole('button',{name:'Delete notification: Booking update'}));await screen.findByRole('alert');expect(screen.queryByText('1 notification deleted.')).toBeNull();await user.click(screen.getByRole('button',{name:'Retry action'}));await screen.findByText('1 notification deleted.');expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[2][1].body);
});
it('clears the displayed inbox when access expires and aborts unfinished loads on dismissal',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(response(inbox)).mockResolvedValueOnce(response({error:'Sign in again'},false,401));vi.stubGlobal('fetch',fetcher);const view=render(<NotificationPanel close={vi.fn()}/>);await screen.findByText(item.message);await userEvent.setup().click(screen.getByRole('button',{name:'Unread'}));await screen.findByRole('alert');expect(screen.queryByText(item.message)).toBeNull();view.unmount();expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true);
});
