import {expect,it} from 'vitest';
import {centralPosition,type CentralPositionInput} from '../../src/modules/gateway/central-position';
const sample=(patch:Partial<CentralPositionInput>={}):CentralPositionInput=>({collectedCentavos:13000,refundedCentavos:0,providerFeesCentavos:500,retainedDepositCentavos:3000,allocations:{cosigner:7000,agency:1000,platform:1000,maintenance:1000},agencyFundingCentavos:0,disbursedCentavos:0,financiallyClosed:true,...patch});
it('retains deposits and commission centrally and charges fees only to the agency share',()=>{
 const p=centralPosition(sample());expect(p).toMatchObject({agencyNetShareCentavos:500,combinedAgencyEntitlementCentavos:8500,availableForDisbursementCentavos:8500,centralCashCentavos:12500,heldPlatformCommissionCentavos:1000,retainedDepositCentavos:3000,platformRemittanceDueCentavos:0,additionalAgencyFundingNeededCentavos:0});
 expect(p.originalAllocations).toEqual({cosigner:7000,agency:1000,platform:1000,maintenance:1000});
 expect(p.availableForDisbursementCentavos+p.heldPlatformCommissionCentavos+p.retainedDepositCentavos).toBe(p.centralCashCentavos);
});
it('never releases an estimated entitlement before financial closing',()=>{
 expect(centralPosition(sample({financiallyClosed:false}))).toMatchObject({availableForDisbursementCentavos:0,remainingAgencyEntitlementCentavos:8500,blockedReason:'Financial closing is required before agency disbursement.'});
});
it('requires funding of fees beyond the agency share without reducing owner or maintenance entitlements',()=>{
 const p=centralPosition(sample({providerFeesCentavos:1500}));expect(p).toMatchObject({agencyNetShareCentavos:0,agencyFeeShortfallCentavos:500,combinedAgencyEntitlementCentavos:8000,additionalAgencyFundingNeededCentavos:500,availableForDisbursementCentavos:0});
 expect(p.originalAllocations.cosigner).toBe(7000);expect(p.originalAllocations.maintenance).toBe(1000);
 expect(centralPosition(sample({providerFeesCentavos:1500,agencyFundingCentavos:500}))).toMatchObject({availableForDisbursementCentavos:8000,additionalAgencyFundingNeededCentavos:0});
});
it('preserves the agency fee obligation after a full refund instead of clamping negative provider cash to zero',()=>{
 const p=centralPosition(sample({refundedCentavos:13000,retainedDepositCentavos:0,allocations:{cosigner:0,agency:0,platform:0,maintenance:0}}));
 expect(p).toMatchObject({centralCashCentavos:-500,agencyFeeShortfallCentavos:500,additionalAgencyFundingNeededCentavos:500,availableForDisbursementCentavos:0});
});
it('reduces retained deposits only against recorded refunds, preserving the existing revenue allocations',()=>{
 expect(centralPosition(sample({refundedCentavos:3000,retainedDepositCentavos:0}))).toMatchObject({centralCashCentavos:9500,heldPlatformCommissionCentavos:1000,combinedAgencyEntitlementCentavos:8500,availableForDisbursementCentavos:8500});
 expect(()=>centralPosition(sample({retainedDepositCentavos:0}))).toThrow('Reconcile');
});
it('keeps an earlier disbursement immutable and proposes recovery after a later accepted revenue reduction',()=>{
 const p=centralPosition(sample({refundedCentavos:1000,disbursedCentavos:8500,allocations:{cosigner:6300,agency:900,platform:900,maintenance:900}}));
 expect(p).toMatchObject({alreadyDisbursedCentavos:8500,combinedAgencyEntitlementCentavos:7600,proposedAgencyRecoveryCentavos:900,availableForDisbursementCentavos:0,centralCashCentavos:3000,additionalAgencyFundingNeededCentavos:900});
 expect(p.blockedReason).toBe('A separately reviewed agency recovery is required.');
});
it('shows partial recorded disbursements and excess agency funding separately without inventing another payout',()=>{
 expect(centralPosition(sample({disbursedCentavos:4000}))).toMatchObject({remainingAgencyEntitlementCentavos:4500,availableForDisbursementCentavos:4500,centralCashCentavos:8500});
 expect(centralPosition(sample({agencyFundingCentavos:200}))).toMatchObject({availableForDisbursementCentavos:8500,unallocatedAgencyFundingCentavos:200});
});
it('supports negotiated and agency-owned/tour allocations without assuming a Cosigner share',()=>{
 const p=centralPosition(sample({collectedCentavos:10000,retainedDepositCentavos:0,allocations:{cosigner:0,agency:9000,platform:1000,maintenance:0}}));
 expect(p).toMatchObject({agencyNetShareCentavos:8500,combinedAgencyEntitlementCentavos:8500,availableForDisbursementCentavos:8500});
});
it('rejects inconsistent, fractional, negative and unsafe aggregate financial inputs',()=>{
 for(const p of [sample({refundedCentavos:13001}),sample({providerFeesCentavos:-1}),sample({collectedCentavos:1.5}),sample({retainedDepositCentavos:2999}),sample({providerFeesCentavos:Number.MAX_SAFE_INTEGER,disbursedCentavos:Number.MAX_SAFE_INTEGER})])expect(()=>centralPosition(p)).toThrow();
});
