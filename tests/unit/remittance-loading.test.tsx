// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {renderHook,act,waitFor,cleanup} from '@testing-library/react';
import {useRemittanceAccount} from '../../src/components/use-remittance-account';
const refresh=vi.hoisted(()=>vi.fn());vi.mock('next/navigation',()=>({useRouter:()=>({refresh})}));
const scope={agencyId:'365ef66a-beec-48fd-88c7-13245a359e31',environment:'DEMO' as const},state={requestVersion:4,agencyName:'Private agency',sources:{page:1},creditSources:{page:1},historyPage:1,creditHistoryPage:1};
const reply=(body:unknown,status=200)=>({ok:status<400,status,json:async()=>body});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('preserves the exact command on an ambiguous response, but prevents duplicate in-flight mutations',async()=>{
 let finish!:(v:unknown)=>void;const fetcher=vi.fn().mockResolvedValueOnce(reply(state)).mockRejectedValueOnce(Error('Interrupted after submission')).mockImplementationOnce(()=>new Promise(r=>{finish=r;}));vi.stubGlobal('fetch',fetcher);
 const {result}=renderHook(()=>useRemittanceAccount(scope));await waitFor(()=>expect(result.current.data?.requestVersion).toBe(4));
 const action={action:'ACCEPT_AGENCY_CREDIT',entryId:'entry',creditDigest:'digest',consent:true};await act(async()=>{expect(await result.current.send(action)).toBe(false);});expect(result.current.error).toContain('Interrupted');
 let pending!:Promise<boolean>;act(()=>{pending=result.current.send(action);});await act(async()=>{expect(await result.current.send(action)).toBe(false);});expect(fetcher).toHaveBeenCalledTimes(3);expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[2][1].body);
 await act(async()=>{finish(reply({...state,requestVersion:5}));expect(await pending).toBe(true);});expect(result.current.data?.requestVersion).toBe(5);
});
it('clears protected data on current access denial and blocks stale actions pending a fresh read',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(reply(state)).mockResolvedValueOnce(reply({error:'Access removed.'},404));vi.stubGlobal('fetch',fetcher);const {result}=renderHook(()=>useRemittanceAccount(scope));await waitFor(()=>expect(result.current.data).not.toBeNull());await act(async()=>{await result.current.load();});expect(result.current.data).toBeNull();expect(result.current.blocked).toBe(true);expect(result.current.error).toBe('Access removed.');
});
it('does not let a late superseded denial erase a newer scoped response',async()=>{
 let old!:(v:unknown)=>void;const fetcher=vi.fn().mockImplementationOnce(()=>new Promise(r=>{old=r;})).mockResolvedValueOnce(reply({...state,requestVersion:6}));vi.stubGlobal('fetch',fetcher);const {result}=renderHook(()=>useRemittanceAccount(scope));await act(async()=>{await result.current.load();});expect(result.current.data?.requestVersion).toBe(6);await act(async()=>{old(reply({error:'Superseded denied read'},403));});expect(result.current.data?.requestVersion).toBe(6);expect(result.current.stale).toBe(false);
});
