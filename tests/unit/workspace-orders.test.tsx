// @vitest-environment jsdom
import React from 'react';
import {afterEach,it,expect} from 'vitest';
import {cleanup,render,screen,fireEvent} from '@testing-library/react';
import {WorkspaceOrders} from '../../src/components/workspace-orders';
import {WorkspaceServicePhoto} from '../../src/components/workspace-service-photo';
import type {CartQuote} from '../../src/modules/cart/pricing';
const quote:CartQuote={digest:'a'.repeat(64),agencyId:'agency',agencyName:'Coastal Mobility',policyRevision:1,sourceRevision:1,title:'Toyota Vios',photoId:'photo',selection:{kind:'RENTAL',offerId:'offer',startAt:'2032-01-01T00:00:00Z',endAt:'2032-01-02T00:00:00Z',mode:'SELF_DRIVE',partySize:2},startAt:'2032-01-01T00:00:00Z',endAt:'2032-01-02T00:00:00Z',priceUnit:'DAY',constraints:{minParty:1,maxParty:5},estimate:{serviceCentavos:200000,refundableDepositCentavos:100000,estimatedDueCentavos:300000}};
const group={total:0,page:1,pageCount:1,items:[]};
afterEach(cleanup);
it('shows saved service details and current/previous requests without representing a quote as payment',()=>{
 render(<WorkspaceOrders cart={{version:1,totalItems:1,readyToRequest:false,groups:[{agencyId:'agency',name:'Coastal Mobility',items:[{id:'line',version:1,selection:quote.selection,savedQuote:quote,currentQuote:null,status:'UNAVAILABLE',reason:'Dates no longer available.'}]}],totals:quote.estimate}} bookings={{active:{...group,total:1,items:[{id:'request',agencyName:'Coastal Mobility',status:'PAYMENT_RECONCILIATION_REQUIRED',createdAt:quote.startAt,lines:[{id:'line',quote}],acceptedTotal:350000}]},history:{...group,total:1,items:[{id:'closed',agencyName:'Coastal Mobility',status:'COMPLETED',createdAt:quote.startAt,lines:[{id:'line',quote}],acceptedTotal:null}]}}}/>);
 expect(screen.getAllByText('Toyota Vios')).toHaveLength(3);expect(screen.getByText('Dates no longer available.')).toBeTruthy();expect(screen.getByText('Payment reconciliation required')).toBeTruthy();expect(screen.getByText('Accepted quotation')).toBeTruthy();expect(screen.queryByText('Paid')).toBeNull();expect(screen.getAllByRole('link',{name:'View request'}).map(a=>a.getAttribute('href'))).toEqual(['/workspace/bookings/request','/workspace/bookings/closed']);
});
it('keeps a readable, fixed-size fallback when a saved listing photo is no longer available',()=>{
 const view=render(<WorkspaceServicePhoto src="/api/vehicle-files/old" title="Toyota Vios"/>);fireEvent.error(screen.getByRole('img'));expect(screen.getByRole('img',{name:'Photo unavailable: Toyota Vios'})).toBeTruthy();view.rerender(<WorkspaceServicePhoto src="/api/vehicle-files/new" title="Toyota Vios"/>);expect(screen.getByRole('img',{name:'Toyota Vios'}).getAttribute('src')).toBe('/api/vehicle-files/new');
});
