// @vitest-environment jsdom
import React from 'react';
import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,cleanup,fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {BookingContacts} from '../../src/components/booking-contacts';
import type {BookingContactLog} from '../../src/modules/bookings/contacts';
const data:BookingContactLog={requestId:'request',version:1,editable:true,blockedReason:null,serverNow:new Date().toISOString(),assignee:null,nextFollowUpAt:null,staff:[{id:'staff',name:'Camille Mendoza'}],total:0,page:1,pageCount:1,history:[]};
const response=(body:unknown,status=200)=>({ok:status<400,status,json:async()=>body});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
async function open(){await userEvent.setup().click(screen.getByText('Update assignment or record contact'));}
it('keeps forms/history collapsed and separates a plan from a real contact attempt',()=>{
 render(<BookingContacts initial={data}/>);expect(screen.getByText('Update assignment or record contact').closest('details')?.open).toBe(false);expect(screen.getByText('Contact history · 0 records').closest('details')?.open).toBe(false);
 expect(screen.getByText(/phone or email discussions do not accept/i)).toBeDefined();
});
it('saves assignment only with one primary action and an exact retry key',async()=>{
 const get=vi.fn().mockResolvedValue(response({...data,version:2,assignee:{id:'staff',name:'Camille Mendoza',available:true}}));vi.stubGlobal('fetch',get);
 render(<BookingContacts initial={data}/>);await open();const user=userEvent.setup();await user.selectOptions(screen.getByLabelText('Assigned staff'),'staff');await user.type(screen.getByLabelText('Internal note'),'Agency review scheduled; no contact made.');await user.click(screen.getByRole('button',{name:'Save follow-up plan'}));
 expect(await screen.findByRole('status')).toBeDefined();const sent=JSON.parse(get.mock.calls[0][1].body);expect(sent.action).toBe('ASSIGNMENT');expect(sent.assigneeId).toBe('staff');expect(sent.method).toBeUndefined();expect(sent.contactedAt).toBeUndefined();expect(sent.idempotencyKey).toMatch(/^[a-f0-9-]{36}$/i);expect(get).toHaveBeenCalledTimes(1);
});
it('retries an uncertain save with the same body and prevents editing before reconciliation',async()=>{
 const get=vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(response({...data,version:2,duplicate:true}));vi.stubGlobal('fetch',get);
 render(<BookingContacts initial={data}/>);await open();const user=userEvent.setup();await user.type(screen.getByLabelText('Internal note'),'Review scheduled.');await user.click(screen.getByRole('button',{name:'Save follow-up plan'}));
 expect(await screen.findByRole('button',{name:'Retry same save'})).toBeDefined();expect(screen.getByLabelText('Internal note').matches(':disabled')).toBe(true);
 await user.click(screen.getByRole('button',{name:'Retry same save'}));expect(await screen.findByText(/already saved/i)).toBeDefined();expect(get.mock.calls[0][1].body).toBe(get.mock.calls[1][1].body);
});
it('keeps a conflicting draft for reference and requires reload instead of blind resubmission',async()=>{
 const get=vi.fn().mockResolvedValueOnce(response({error:'The contact log changed.'},409)).mockResolvedValueOnce(response({...data,version:2}));vi.stubGlobal('fetch',get);
 render(<BookingContacts initial={data}/>);await open();const user=userEvent.setup();await user.type(screen.getByLabelText('Internal note'),'My unsaved follow-up plan.');await user.click(screen.getByRole('button',{name:'Save follow-up plan'}));
 expect(await screen.findByText(/your form has been kept/i)).toBeDefined();expect((screen.getByLabelText('Internal note') as HTMLTextAreaElement).value).toBe('My unsaved follow-up plan.');expect((screen.getByRole('button',{name:'Save follow-up plan'}) as HTMLButtonElement).disabled).toBe(true);
 await user.click(screen.getByRole('button',{name:'Reload contact log'}));expect((screen.getByLabelText('Internal note') as HTMLTextAreaElement).value).toBe('');
});
it('records an already-made attempt with method, outcome and Manila time without sending email',async()=>{
 const get=vi.fn().mockResolvedValue(response({...data,version:2}));vi.stubGlobal('fetch',get);render(<BookingContacts initial={data}/>);await open();const user=userEvent.setup();
 await user.selectOptions(screen.getByLabelText('Record type'),'CONTACT');await user.selectOptions(screen.getByLabelText('Contact method'),'EMAIL');await user.selectOptions(screen.getByLabelText('Contact outcome'),'AWAITING_REPLY');await user.type(screen.getByLabelText('Internal note'),'Awaiting the customer response.');await user.click(screen.getByRole('button',{name:'Record contact attempt'}));
 expect(await screen.findByRole('status')).toBeDefined();const body=JSON.parse(get.mock.calls[0][1].body);expect(body).toMatchObject({action:'CONTACT',method:'EMAIL',outcome:'AWAITING_REPLY'});expect(Number.isFinite(Date.parse(body.contactedAt))).toBe(true);expect(get.mock.calls[0][0]).toBe('/api/booking-requests/request/contacts');
});
it('does not offer writes after quotation issuance and clears private data after access is denied',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response({error:'Request not found.'},404)));
 render(<BookingContacts initial={{...data,editable:false,blockedReason:'Quotation already issued.'}}/>);expect(screen.queryByText('Update assignment or record contact')).toBeNull();expect(screen.getByText(/quotation already issued/i)).toBeDefined();await userEvent.setup().click(screen.getByRole('button',{name:'Reload contact log'}));expect(await screen.findByRole('alert')).toBeDefined();expect(screen.queryByText('Contact history · 0 records')).toBeNull();
});

it('retains a native datetime input event when another field renders and saves the Manila schedule',async()=>{
 const get=vi.fn().mockResolvedValue(response({...data,version:2,nextFollowUpAt:'2031-11-10T02:00:00.000Z'}));vi.stubGlobal('fetch',get);render(<BookingContacts initial={data}/>);await open();
 const input=screen.getByLabelText('Next follow-up · Manila (optional)');fireEvent.input(input,{target:{value:'2031-11-10T10:00'}});
 const user=userEvent.setup();await user.type(screen.getByLabelText('Internal note'),'Review scheduled; no external contact.');expect((input as HTMLInputElement).value).toBe('2031-11-10T10:00');
 await user.click(screen.getByRole('button',{name:'Save follow-up plan'}));await screen.findByRole('status');expect(JSON.parse(get.mock.calls[0][1].body).nextFollowUpAt).toBe('2031-11-10T02:00:00.000Z');
});
