// @vitest-environment jsdom
import React from 'react';
import {afterEach,it,expect,vi} from 'vitest';
import {cleanup,render,screen,waitFor,act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
const m=vi.hoisted(()=>({refresh:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:m.refresh})}));
import {HostedPayment} from '../../src/components/hosted-payment';
const source={requestVersion:3,isOwner:true,agreement:{id:'agreement',digest:'a'.repeat(64),quoteId:'quote'},methods:['PAYMONGO'],holdActive:true,status:'AGREEMENT_SIGNED',totals:{balanceCentavos:10000}};
const initial={enabled:true,mode:'test',custodyNotice:{revision:'notice-v1',digest:'b'.repeat(64),body:'Saved central payment notice'},checkout:null};
const checkout={id:'checkout',quoteId:'quote',agreementId:'agreement',mode:'test',status:'AWAITING_PAYMENT',amountCentavos:10000,checkoutUrl:'https://checkout.paymongo.com/cs_original',payment:null};
const reply=(body:unknown,status=200)=>({ok:status<400,status,json:async()=>body});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();vi.clearAllMocks();window.history.replaceState(null,'','/');});
it('requires the versioned custody notice before preparing one server-priced checkout',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(reply(initial)).mockResolvedValue(reply({...initial,checkout}));vi.stubGlobal('fetch',fetcher);render(<HostedPayment requestId="request" source={source}/>);const button=await screen.findByRole('button',{name:'Prepare secure checkout'});expect((button as HTMLButtonElement).disabled).toBe(true);expect(screen.getByText('PayMongo test payment · no real charge.')).toBeTruthy();const user=userEvent.setup();await user.click(screen.getByRole('checkbox'));await user.click(button);expect(await screen.findByRole('link',{name:'Continue to PayMongo'})).toBeTruthy();const command=JSON.parse(fetcher.mock.calls[1][1].body);expect(command).toMatchObject({version:3,agreementId:'agreement',digest:'a'.repeat(64),custodyConsent:{revision:'notice-v1',digest:'b'.repeat(64),accepted:true}});expect(command).not.toHaveProperty('amountCentavos');expect(fetcher.mock.calls.filter(([,init])=>init.method==='POST')).toHaveLength(1);
});
it('does not treat the provider return parameter as payment confirmation or create a replacement checkout',async()=>{
 window.history.replaceState(null,'','/?payment_return=success');const fetcher=vi.fn().mockResolvedValue(reply({...initial,checkout}));vi.stubGlobal('fetch',fetcher);render(<HostedPayment requestId="request" source={source}/>);expect(await screen.findByText('You returned from PayMongo. Payment will be confirmed only after provider verification.')).toBeTruthy();expect(await screen.findByText('Awaiting payment')).toBeTruthy();expect(screen.queryByText('Payment confirmed by PayMongo')).toBeNull();expect(screen.queryByRole('button',{name:'Prepare secure checkout'})).toBeNull();expect(fetcher.mock.calls.every(([,init])=>!init.method)).toBe(true);
});
it('preserves the exact preparation key after an ambiguous result rather than inventing another payment',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(reply(initial)).mockRejectedValueOnce(Error('offline')).mockResolvedValue(reply({...initial,checkout}));vi.stubGlobal('fetch',fetcher);render(<HostedPayment requestId="request" source={source}/>);const user=userEvent.setup();await screen.findByRole('button',{name:'Prepare secure checkout'});await user.click(screen.getByRole('checkbox'));await user.click(screen.getByRole('button',{name:'Prepare secure checkout'}));await screen.findByRole('alert');await user.click(screen.getByRole('button',{name:'Prepare secure checkout'}));await screen.findByRole('link',{name:'Continue to PayMongo'});expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[2][1].body);
});
it('refreshes booking data only after a provider-verified paid result and clears a denied private checkout',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(reply({...initial,checkout:{...checkout,status:'PAID',checkoutUrl:null,payment:{collectionId:'collection'}}})).mockResolvedValue(reply({error:'Sign in'},401));vi.stubGlobal('fetch',fetcher);render(<HostedPayment requestId="request" source={source}/>);await screen.findByText('Payment confirmed by PayMongo');expect(m.refresh).toHaveBeenCalledOnce();await userEvent.setup().click(screen.getByRole('button',{name:'Refresh online payment status'}));await screen.findByRole('alert');expect(screen.queryByText('Payment confirmed by PayMongo')).toBeNull();
});

it('prepares an accepted settlement balance without requiring a new quotation hold or sending an amount',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(reply(initial)).mockResolvedValue(reply({...initial,checkout:{...checkout,settlementId:'settlement'}}));vi.stubGlobal('fetch',fetcher);render(<HostedPayment requestId="request" purpose="SETTLEMENT" source={{...source,agreement:null,settlement:{id:'settlement',digest:'c'.repeat(64)},holdActive:false,status:'FULFILLMENT_RECONCILIATION_PENDING'}}/>);const user=userEvent.setup();await screen.findByRole('button',{name:'Prepare secure checkout'});await user.click(screen.getByRole('checkbox'));await user.click(screen.getByRole('button',{name:'Prepare secure checkout'}));await screen.findByRole('link',{name:'Continue to PayMongo'});expect(fetcher.mock.calls[1][0]).toBe('/api/booking-requests/request/settlement-checkout');const command=JSON.parse(fetcher.mock.calls[1][1].body);expect(command).toMatchObject({settlementId:'settlement',digest:'c'.repeat(64)});expect(command).not.toHaveProperty('amountCentavos');expect(command).not.toHaveProperty('agreementId');
});
