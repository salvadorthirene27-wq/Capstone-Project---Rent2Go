// @vitest-environment jsdom
import React from 'react';import {afterEach,it,expect} from 'vitest';import {render,screen,cleanup} from '@testing-library/react';
import {AgencyFollowUps} from '../../src/components/agency-followups';import {BookingList} from '../../src/components/booking-list';afterEach(cleanup);
it('links a scheduled follow-up to its contact section and preserves the other queue page',()=>{
 render(<AgencyFollowUps data={{total:11,page:1,pageCount:2,items:[{id:'request-id',renterName:'Gabriel Santos',assignedName:null,nextFollowUpAt:'2031-01-01T00:00:00Z',overdue:true}]}} agencyId="agency" requestPage={3}/>);
 expect(screen.getByRole('link',{name:/Gabriel Santos/}).getAttribute('href')).toBe('/agency/agency/bookings/request-id#contact-followup');expect(screen.getByText(/Overdue/)).toBeDefined();expect(screen.getByRole('link',{name:'Next follow-ups'}).getAttribute('href')).toBe('/agency/agency/bookings?page=3&followPage=2');
});
it('keeps the follow-up history page selected while paging booking requests',()=>{
 render(<BookingList base="/agency/agency/bookings" list={{items:[],total:30,page:1,pageCount:2}} extraQuery={{followPage:'2'}}/>);expect(screen.getByRole('link',{name:'Next'}).getAttribute('href')).toBe('/agency/agency/bookings?followPage=2&page=2');
});
