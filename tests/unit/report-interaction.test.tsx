// @vitest-environment jsdom
import React from 'react';
import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,cleanup,fireEvent,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {ReportExport} from '../../src/components/report-export';
import {ReportFilters} from '../../src/components/report-filters';
const filters={environment:'DEMO' as const,from:'2026-11-01',to:'2026-11-07',record:'ALLOCATIONS' as const},scope={type:'OWNER' as const};
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('requires export intent, keeps a failed purpose for correction and explains the complete export limit',async()=>{
 const fetcher=vi.fn().mockResolvedValue({ok:false,json:async()=>({error:'Access changed. Refresh before exporting.'})});vi.stubGlobal('fetch',fetcher);const view=render(<ReportExport scope={scope} filters={filters} total={21}/>),user=userEvent.setup();await user.click(screen.getByText('Export this financial statement (CSV)'));const button=screen.getByRole('button',{name:'Download filtered CSV'});
 expect((button as HTMLButtonElement).disabled).toBe(true);await user.type(screen.getByLabelText('Export purpose'),'Reconcile November earnings');expect((button as HTMLButtonElement).disabled).toBe(true);await user.click(screen.getByRole('checkbox'));await user.click(button);expect((await screen.findByRole('alert')).textContent).toContain('Access changed');expect((screen.getByLabelText('Export purpose') as HTMLTextAreaElement).value).toBe('Reconcile November earnings');expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({scope,filters,acknowledged:true});
 view.rerender(<ReportExport scope={scope} filters={filters} total={5001}/>);expect((button as HTMLButtonElement).disabled).toBe(true);expect(screen.getByText(/Download all 5,001 filtered records/).textContent).toContain('choose a narrower period');
});
it('prevents duplicate exports in flight and reports browser download preparation only after success',async()=>{
 let resolve!:(value:unknown)=>void;const fetcher=vi.fn((_input:unknown,_init:RequestInit)=>new Promise(r=>{resolve=r;}));vi.stubGlobal('fetch',fetcher);vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:vi.fn(()=> 'blob:statement'),revokeObjectURL:vi.fn()}));const clicked=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 render(<ReportExport scope={scope} filters={filters} total={21}/>);const user=userEvent.setup();await user.click(screen.getByText('Export this financial statement (CSV)'));await user.type(screen.getByLabelText('Export purpose'),'Reconcile November earnings');await user.click(screen.getByRole('checkbox'));const button=screen.getByRole('button',{name:'Download filtered CSV'});await user.dblClick(button);expect(fetcher).toHaveBeenCalledTimes(1);expect(screen.queryByRole('status')).toBeNull();
 resolve({ok:true,headers:new Headers({'Content-Disposition':'attachment; filename="rent2go-owner.csv"'}),blob:async()=>new Blob(['statement'])});await waitFor(()=>expect(clicked).toHaveBeenCalledTimes(1));expect((await screen.findByRole('status')).textContent).toBe('CSV prepared. Your browser handles the download.');
});
it('aborts a pending export when its scoped component is replaced',async()=>{
 const fetcher=vi.fn((_input:unknown,_init:RequestInit)=>new Promise(()=>{}));vi.stubGlobal('fetch',fetcher);const view=render(<ReportExport scope={scope} filters={filters} total={1}/>),user=userEvent.setup();await user.click(screen.getByText('Export this financial statement (CSV)'));await user.type(screen.getByLabelText('Export purpose'),'Reconcile my earnings');await user.click(screen.getByRole('checkbox'));await user.click(screen.getByRole('button',{name:'Download filtered CSV'}));const signal=fetcher.mock.calls[0][1].signal as AbortSignal;view.unmount();expect(signal.aborted).toBe(true);
});
it('focuses an invalid date range message while preserving the selected financial statement',async()=>{
 render(<ReportFilters filters={{...filters,page:1,allowedRecords:['ALLOCATIONS','PAYOUTS']}}/>);fireEvent.change(screen.getByLabelText('From (Philippine date)'),{target:{value:'2026-11-08'}});const form=screen.getByRole('button',{name:'Apply filters'}).closest('form')!;expect(fireEvent.submit(form)).toBe(false);const alert=await screen.findByRole('alert');expect(document.activeElement).toBe(alert);expect((screen.getByLabelText('Financial records') as HTMLSelectElement).value).toBe('DEMO');expect((screen.getByLabelText('Statement type') as HTMLSelectElement).options).toHaveLength(2);
 fireEvent.change(screen.getByLabelText('From (Philippine date)'),{target:{value:'2026-11-01'}});expect(screen.queryByRole('alert')).toBeNull();expect(fireEvent.submit(form)).toBe(true);
});
