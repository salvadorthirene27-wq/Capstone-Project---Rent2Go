// @vitest-environment jsdom
import React from 'react';
import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {PlatformSettingsEditor} from '../../src/components/platform-settings';
import type {PlatformSettings} from '../../src/modules/platform/service';
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
const m=vi.hoisted(()=>({actor:vi.fn(),get:vi.fn(),change:vi.fn(),limit:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireActor:m.actor}));vi.mock('@/lib/rate-limit',()=>({rateLimit:m.limit}));vi.mock('@/modules/platform/service',()=>({getPlatformSettings:m.get,publishPlatformSettings:m.change}));
import {PATCH} from '../../src/app/api/platform/settings/route';
const payload={consignedDefaults:{cosigner:7000,agency:1000,platform:1000,maintenance:1000},termsTitle:'Marketplace terms',termsText:'Accepted marketplace terms. '.repeat(8).trim(),inactiveEvidenceReviewDays:null,faqs:[{question:'How do I book?',answer:'Follow the saved status in your booking workspace.'}]};
const data={revision:1,version:1,digest:'a'.repeat(64),payload,publishedAt:'2026-11-08T00:00:00Z',history:[],reviewCandidates:null} as PlatformSettings;
afterEach(()=>{cleanup();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();vi.resetAllMocks();});
const edit=()=>{fireEvent.change(screen.getByLabelText('Terms title'),{target:{value:'Updated marketplace terms'}});fireEvent.change(screen.getByLabelText('Publication reason'),{target:{value:'Reviewed exact marketplace content.'}});fireEvent.click(screen.getByRole('checkbox'));};
it('requires changes and fresh acknowledgment for every edit and explains review without automatic deletion',()=>{
 render(<PlatformSettingsEditor initial={data}/>);const button=screen.getByRole('button',{name:'Publish settings version'});expect((button as HTMLButtonElement).disabled).toBe(true);edit();expect((button as HTMLButtonElement).disabled).toBe(false);fireEvent.change(screen.getByLabelText('Rent2Go (%)'),{target:{value:'12'}});expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);expect(screen.getByText(/not a legal retention period or automatic deletion rule/)).toBeTruthy();expect(screen.getByText(/Existing applications, accepted offers/)).toBeTruthy();
});
it('keeps the same retry key for a network failure and prevents double publication',async()=>{
 const fetcher=vi.fn().mockRejectedValueOnce(Error('Connection interrupted')).mockResolvedValueOnce({ok:true,json:async()=>({...data,revision:2,version:2,payload:{...payload,termsTitle:'Updated marketplace terms'}})});vi.stubGlobal('fetch',fetcher);render(<PlatformSettingsEditor initial={data}/>);edit();fireEvent.click(screen.getByRole('button',{name:'Publish settings version'}));await screen.findByText('Connection interrupted');fireEvent.click(screen.getByRole('button',{name:'Publish settings version'}));await screen.findByRole('status');expect(fetcher).toHaveBeenCalledTimes(2);expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({version:1,digest:data.digest,acknowledged:true});expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
});
it('announces invalid shares with a link to the share fields and sends no request',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);render(<PlatformSettingsEditor initial={data}/>);edit();fireEvent.change(screen.getByLabelText('Agency (%)'),{target:{value:'11'}});fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Publish settings version'}));expect(await screen.findByRole('alert')).toBeTruthy();expect(screen.getByRole('link',{name:'Revenue shares must total exactly 100%.'}).getAttribute('href')).toBe('#setting-consignedDefaults');expect(fetcher).not.toHaveBeenCalled();
});
it('blocks stale edits and hides private settings after authority is lost',async()=>{
 vi.spyOn(window,'confirm').mockReturnValue(true);const fetcher=vi.fn().mockResolvedValueOnce({ok:false,status:409,json:async()=>({error:'Settings changed.'})}).mockResolvedValueOnce({ok:false,status:403,json:async()=>({error:'Access denied.'})});vi.stubGlobal('fetch',fetcher);render(<PlatformSettingsEditor initial={data}/>);edit();fireEvent.click(screen.getByRole('button',{name:'Publish settings version'}));await screen.findByText('Settings changed.');expect((screen.getByLabelText('Terms title').closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true);fireEvent.click(screen.getByRole('button',{name:'Refresh published settings'}));await screen.findByText('Access denied.');expect(screen.queryByLabelText('Terms title')).toBeNull();
});
it('rejects a foreign mutation origin before reading identity or invoking the publisher',async()=>{
 vi.stubEnv('APP_ORIGIN','http://localhost:3100');const r=await PATCH(new Request('http://localhost:3100/api/platform/settings',{method:'PATCH',headers:{Origin:'https://foreign.test','Content-Type':'application/json'},body:'{}'}));expect(r.status).toBe(403);expect(m.actor).not.toHaveBeenCalled();expect(m.change).not.toHaveBeenCalled();
});
