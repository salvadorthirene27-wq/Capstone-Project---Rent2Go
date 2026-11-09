// @vitest-environment jsdom
import React from 'react';
import {afterEach,it,expect} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import {CentralCustody} from '../../src/components/central-custody';
import {centralPosition} from '../../src/modules/gateway/central-position';
afterEach(cleanup);
const base={requestId:'booking',agencyId:'agency',custodian:'RENT2GO' as const,feeBearer:'AGENCY' as const,canDisburse:false as const,bankSettlementVerified:false as const,available:true,verifiedGrossCentavos:10000,providerFeesCentavos:1500,providerNetReceiptsCentavos:8500,financiallyClosed:true,statement:null,position:centralPosition({collectedCentavos:10000,refundedCentavos:0,providerFeesCentavos:1500,retainedDepositCentavos:0,allocations:{cosigner:7000,agency:1000,maintenance:1000,platform:1000},agencyFundingCentavos:0,disbursedCentavos:0,financiallyClosed:true}),blockedReason:'Agency funding is required.',receipts:[{checkoutId:'checkout',receiptId:'receipt',providerPaymentId:'pay_example',mode:'test' as const,grossCentavos:10000,feeCentavos:1500,netCentavos:8500,verifiedAt:'2030-01-01T00:00:00Z',postingOutcome:'COLLECTED'}]};
it('keeps empty/unavailable gateway records out of unrelated agency booking screens',()=>{
 const {container,rerender}=render(<CentralCustody data={{...base,available:false}}/>);expect(container.textContent).toBe('');rerender(<CentralCustody data={{...base,receipts:[]}}/>);expect(container.textContent).toBe('');
});
it('distinguishes receipt provenance and protected allocations without offering a transfer action',()=>{
 render(<CentralCustody data={base}/>);expect(screen.getByText('Protected Cosigner allocation')).toBeTruthy();expect(screen.getByText('Protected maintenance allocation')).toBeTruthy();expect(screen.getByText('Agency fee shortfall')).toBeTruthy();expect(screen.getByText('PayMongo test · no real charge')).toBeTruthy();expect(screen.queryByRole('button')).toBeNull();expect(screen.getByText(/do not establish a bank settlement/)).toBeTruthy();
});
it('does not invent revenue allocations from unclosed receipts',()=>{
 render(<CentralCustody data={{...base,financiallyClosed:false,position:null,blockedReason:'Financial closing is required.'}}/>);expect(screen.queryByText('Closed revenue allocation')).toBeNull();expect(screen.getByText('Financial closing is required.')).toBeTruthy();expect(screen.getByText(/Refundable deposits remain separate/)).toBeTruthy();
});
