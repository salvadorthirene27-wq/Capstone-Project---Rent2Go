// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import {OperationsOverview} from '../../src/components/operations-overview';
const m=vi.hoisted(()=>({actor:vi.fn(),limit:vi.fn(),get:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireActor:m.actor}));vi.mock('@/lib/rate-limit',()=>({rateLimit:m.limit}));vi.mock('@/modules/operations/service',()=>({getOperations:m.get}));
import {GET} from '../../src/app/api/operations/route';
import {DomainError} from '../../src/modules/partners/workflow';
const data={preparedAt:'2026-11-08T00:00:00Z',databaseReachable:true,holdExpiry:{state:'NEEDS_ATTENTION',awaitingExpiry:2,lastSeenAt:'2026-11-08T00:00:00Z',lastSuccessAt:null,lastFailureAt:'2026-11-08T00:00:00Z',lastErrorType:'Error',lastProcessed:null},history:[{outcome:'FAILED' as const,processed:null as any,errorType:'Error',startedAt:'2026-11-08T00:00:00Z',completedAt:'2026-11-08T00:00:00Z'}],emailDispatchEnabled:false};
beforeEach(()=>{vi.resetAllMocks();m.actor.mockResolvedValue({id:'admin',role:'SUPER_ADMIN'});m.get.mockResolvedValue(data);});afterEach(cleanup);
it('does not represent recent contact or a failed batch as successful expiry or email delivery',()=>{
 render(<OperationsOverview data={data}/>);expect(screen.getByText('Recent batch needs attention')).toBeTruthy();expect(screen.queryByText('0 holds released')).toBeNull();expect(screen.getByText('Release count unavailable')).toBeTruthy();expect(screen.getByText('Off')).toBeTruthy();expect(screen.queryByRole('button',{name:/send/i})).toBeNull();expect(screen.getByText(/recent worker contact is separate/i)).toBeTruthy();
});
it('keeps health observations authenticated, access-limited and uncached',async()=>{
 m.actor.mockRejectedValueOnce(new DomainError('Sign in.',401));expect((await GET()).status).toBe(401);expect(m.get).not.toHaveBeenCalled();m.get.mockRejectedValueOnce(new DomainError('Platform operational access is required.',403));expect((await GET()).status).toBe(403);const response=await GET();expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('no-store');expect(await response.json()).toEqual(data);
});
