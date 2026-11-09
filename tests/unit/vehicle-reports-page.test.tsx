// @vitest-environment jsdom
import React from 'react';
import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
vi.mock('@/lib/page-actor',()=>({pageActor:async()=>({id:'owner',role:'COSIGNER'})}));
vi.mock('@/components/financial-report-page',()=>({FinancialReportPage:({back}:any)=><a href={back.href}>{back.label}</a>}));
import Page from '../../src/app/workspace/reports/page';
afterEach(cleanup);
it.each(['DEMO','MANUAL'])('preserves %s records when returning from a vehicle report to earnings',async environment=>{
 render(await Page({searchParams:Promise.resolve({environment})}));expect(screen.getByRole('link',{name:'Back to my vehicle earnings'}).getAttribute('href')).toBe(`/workspace/earnings?environment=${environment}`);
});
