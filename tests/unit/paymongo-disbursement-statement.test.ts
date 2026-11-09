import {randomUUID} from 'node:crypto';
import {it,expect} from 'vitest';
import {buildDisbursementStatement,type DisbursementStatementSource} from '../../src/modules/gateway/disbursement-statement';
function source(fee=500):DisbursementStatementSource{
 const identity={requestId:randomUUID(),agencyId:randomUUID(),quoteId:randomUUID()},closeId=randomUUID();
 return {...identity,closeId,environment:'DEMO',closedRevenueCentavos:10000,unresolvedGatewayCount:0,refundReservationsCentavos:0,verifiedRefundedCentavos:0,revenueCreditCount:0,
 receipts:[{...identity,id:randomUUID(),checkoutId:randomUUID(),collectionId:randomUUID(),paymentId:'pay_statement123',mode:'test',grossCentavos:10000,feeCentavos:fee,netCentavos:10000-fee,postingOutcome:'COLLECTED',requiresReconciliation:false}],
 entries:([['COSIGNER',7000],['AGENCY',1000],['PLATFORM',1000],['MAINTENANCE',1000]] as const).map(([recipient,amountCentavos])=>({...identity,id:randomUUID(),closeId,environment:'DEMO',recipient,amountCentavos,beneficiaryActorId:recipient==='COSIGNER'?randomUUID():null}))};
}
it('preserves exact owner/maintenance/platform sources and charges the provider fee only to agency entries',()=>{
 const v=source(),s=buildDisbursementStatement(v);expect(s).toMatchObject({verifiedGrossCentavos:10000,providerFeesCentavos:500,providerNetReceiptsCentavos:9500,canExecute:false,bankSettlementVerified:false,ownerFundsReleasedCentavos:0});
 expect(s.sources.find(e=>e.recipient==='COSIGNER')).toMatchObject({originalCentavos:7000,agencyFeeCentavos:0,proposedDisbursementCentavos:7000});expect(s.sources.find(e=>e.recipient==='AGENCY')).toMatchObject({agencyFeeCentavos:500,proposedDisbursementCentavos:500});expect(s.sources.find(e=>e.recipient==='PLATFORM')).toMatchObject({proposedDisbursementCentavos:0,heldPlatformCentavos:1000});expect(s.sources.find(e=>e.recipient==='MAINTENANCE')?.proposedDisbursementCentavos).toBe(1000);expect(s.position.availableForDisbursementCentavos).toBe(8500);
});
it('blocks a fee shortfall without spending protected owner or maintenance allocations',()=>{
 const s=buildDisbursementStatement(source(1500));expect(s.position).toMatchObject({agencyFeeShortfallCentavos:500,additionalAgencyFundingNeededCentavos:500,availableForDisbursementCentavos:0});expect(s.sources.find(e=>e.recipient==='COSIGNER')?.proposedDisbursementCentavos).toBe(7000);expect(s.sources.find(e=>e.recipient==='MAINTENANCE')?.proposedDisbursementCentavos).toBe(1000);expect(s.ownerFundsReleasedCentavos).toBe(0);
});
it('attributes indivisible fee centavos deterministically regardless of source order',()=>{
 const v=source(1),agency=v.entries.find(e=>e.recipient==='AGENCY')!;agency.amountCentavos=333;v.entries.push({...agency,id:randomUUID(),amountCentavos:333},{...agency,id:randomUUID(),amountCentavos:334});const s=buildDisbursementStatement(v),reordered=buildDisbursementStatement({...v,receipts:[...v.receipts].reverse(),entries:[...v.entries].reverse()});expect(reordered).toEqual(s);expect(s.sources.filter(e=>e.recipient==='AGENCY').map(e=>e.agencyFeeCentavos).sort()).toEqual([0,0,1]);expect(s.sources.find(e=>e.originalCentavos===334)?.agencyFeeCentavos).toBe(1);
});
it('rejects cross-booking, cross-agency, cross-quote, mode and source mismatches',()=>{
 for(const change of [{requestId:randomUUID()},{agencyId:randomUUID()},{quoteId:randomUUID()},{mode:'live'},{netCentavos:9501},{postingOutcome:'CLOSED_LIABILITY'},{requiresReconciliation:true}]){const v=source();expect(()=>buildDisbursementStatement({...v,receipts:[{...v.receipts[0],...change}]})).toThrow();}
 for(const change of [{requestId:randomUUID()},{agencyId:randomUUID()},{quoteId:randomUUID()},{closeId:randomUUID()},{environment:'MANUAL'},{amountCentavos:7001},{beneficiaryActorId:null}]){const v=source();expect(()=>buildDisbursementStatement({...v,entries:[{...v.entries[0],...change},...v.entries.slice(1)]})).toThrow();}
});
it('refuses duplicate receipt, checkout, payment, collection or allocation identities',()=>{
 for(const key of ['id','checkoutId','paymentId','collectionId'] as const){const v=source(),other:DisbursementStatementSource['receipts'][number]={...v.receipts[0],id:randomUUID(),checkoutId:randomUUID(),collectionId:randomUUID(),paymentId:'pay_second123',grossCentavos:5000,feeCentavos:250,netCentavos:4750};v.receipts[0]={...v.receipts[0],grossCentavos:5000,feeCentavos:250,netCentavos:4750};other[key]=v.receipts[0][key];v.receipts.push(other);expect(()=>buildDisbursementStatement(v)).toThrow();}
 const v=source();v.entries.push({...v.entries[1],amountCentavos:0});expect(()=>buildDisbursementStatement(v)).toThrow();
});
it('withholds statements for retained deposits, refunds, pending work or later credits until exact adjustments exist',()=>{
 for(const change of [{unresolvedGatewayCount:1},{refundReservationsCentavos:100},{verifiedRefundedCentavos:100},{revenueCreditCount:1},{closedRevenueCentavos:9000}])expect(()=>buildDisbursementStatement({...source(),...change})).toThrow();
 const v=source();v.entries[0].amountCentavos-=100;expect(()=>buildDisbursementStatement(v)).toThrow();
});
it('changes the source digest for a changed fee or destination beneficiary and rejects unsafe arithmetic',()=>{
 const v=source(),s=buildDisbursementStatement(v);const changed=structuredClone(v);changed.entries[0].beneficiaryActorId=randomUUID();expect(buildDisbursementStatement(changed).sourceDigest).not.toBe(s.sourceDigest);const fees=structuredClone(v);fees.receipts[0].feeCentavos++;fees.receipts[0].netCentavos--;expect(buildDisbursementStatement(fees).sourceDigest).not.toBe(s.sourceDigest);
 const unsafe=source();unsafe.receipts[0].grossCentavos=Number.MAX_SAFE_INTEGER+1;expect(()=>buildDisbursementStatement(unsafe)).toThrow();
});
