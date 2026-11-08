// @vitest-environment jsdom
import React from 'react';
import {afterEach,it,expect} from 'vitest';import {render,screen,cleanup} from '@testing-library/react';
import {PaymentReconciliationList} from '../../src/components/payment-reconciliation';
import {reconciliationQuery,type PaymentReconciliation} from '../../src/modules/gateway/reconciliation';
afterEach(cleanup);
const base:PaymentReconciliation={query:{kind:'ALL',mode:'ALL',reference:'',page:1},page:1,pageCount:1,total:0,checkoutTotal:0,notificationTotal:0,available:true,items:[]};
it('keeps expected, verified and unmatched amounts distinct and offers no false resolution control',()=>{
 const common={id:'case',checkoutId:'checkout',requestId:'booking',agencyName:'Bicol Journeys',mode:'test' as const,providerId:'cs_fixture',providerEventId:null,amountCentavos:10000,recordedAt:'2031-01-01T00:00:00Z'};
 render(<PaymentReconciliationList data={{...base,total:3,checkoutTotal:2,notificationTotal:1,items:[{...common,kind:'CHECKOUT',amountKind:'EXPECTED',reason:'CHECKOUT_REVIEW'},{...common,id:'verified',kind:'CHECKOUT',amountKind:'VERIFIED',reason:'CLOSED_BOOKING_FUNDS'},{...common,id:'unmatched',kind:'NOTIFICATION',requestId:null,agencyName:null,amountKind:'DECLARED',reason:'UNMATCHED'}]}}/>);
 expect(screen.getByText('Expected checkout amount')).toBeDefined();expect(screen.getByText('Verified receipt amount')).toBeDefined();expect(screen.getByText('Unmatched notification amount')).toBeDefined();expect(screen.getByText(/must not be added together/i)).toBeDefined();expect(screen.queryByRole('button',{name:/resolve|refund|release/i})).toBeNull();expect(screen.getAllByText(/no real charge/i)).toHaveLength(3);
});
it('reports unavailable records honestly and preserves filters through pagination',()=>{
 const view=render(<PaymentReconciliationList data={{...base,available:false}}/>);expect(screen.getByText(/records are not available yet/i)).toBeDefined();expect(screen.queryByText('No cases match these filters.')).toBeNull();
 view.rerender(<PaymentReconciliationList data={{...base,query:{...base.query,mode:'test',reference:'booking'},total:12,pageCount:2}}/>);expect(screen.getByRole('link',{name:'Next'}).getAttribute('href')).toContain('reference=booking');expect(screen.getByRole('link',{name:'Next'}).getAttribute('href')).toContain('mode=test');
});
it('rejects unsupported, repeated-shaped or unbounded queue filters',()=>{
 expect(reconciliationQuery.safeParse({page:0}).success).toBe(false);expect(reconciliationQuery.safeParse({mode:'sandbox'}).success).toBe(false);expect(reconciliationQuery.safeParse({reference:'x'.repeat(161)}).success).toBe(false);expect(reconciliationQuery.safeParse({actor:'another'}).success).toBe(false);
});
