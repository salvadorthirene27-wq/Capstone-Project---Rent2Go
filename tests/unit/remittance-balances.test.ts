import {it,expect} from 'vitest';
import {remittanceSource,remittanceBalances,allocateRemittance} from '../../src/modules/accounting/remittance-balances';
it('reduces an unpaid original platform allocation without inventing payment or owner earnings',()=>{
 expect(remittanceSource(10000n,3000n)).toMatchObject({netCentavos:7000,paidCentavos:0,dueCentavos:7000,excessCentavos:0});
 expect(()=>remittanceSource(10000n,10001n)).toThrow();expect(()=>remittanceSource(10000n,0n,10000n,1n)).toThrow();
});
it('preserves a remitted source and exposes its exact later excess separately from future sources',()=>{
 expect(remittanceSource(10000n,3000n,10000n)).toMatchObject({netCentavos:7000,paidCentavos:10000,dueCentavos:0,excessCentavos:3000});
 const totals={original:20000n,credits:3000n,paid:10000n,offset:0n,reserved:0n,due:10000n,excess:3000n,accepted:0n};
 expect(remittanceBalances(totals)).toMatchObject({dueCentavos:10000,awaitingAcceptanceCentavos:3000,availableCreditCentavos:0,dueAfterAvailableCreditCentavos:10000});
 expect(remittanceBalances({...totals,accepted:3000n})).toMatchObject({dueCentavos:10000,awaitingAcceptanceCentavos:0,availableCreditCentavos:3000,applicableCreditCentavos:3000,dueAfterAvailableCreditCentavos:7000});
});
it('keeps accepted agency credit distinct from actual cash receipts when applied to another source',()=>{
 expect(remittanceBalances({original:20000n,credits:3000n,paid:10000n,offset:3000n,reserved:0n,due:7000n,excess:3000n,accepted:3000n})).toMatchObject({paidCentavos:10000,offsetCentavos:3000,availableCreditCentavos:0,dueCentavos:7000});
});
it('does not multiply money when a later refund reverses a source previously settled using agency credit',()=>{
 const t={original:20000n,credits:20000n,paid:10000n,offset:10000n,reserved:0n,due:0n,excess:20000n,accepted:10000n};
 expect(remittanceBalances(t)).toMatchObject({paidCentavos:10000,availableCreditCentavos:0,awaitingAcceptanceCentavos:10000});
 expect(remittanceBalances({...t,accepted:20000n})).toMatchObject({paidCentavos:10000,availableCreditCentavos:10000,awaitingAcceptanceCentavos:0});
});
it('rejects stranded reservations, unaccepted credit applications and inconsistent aggregates',()=>{
 expect(()=>remittanceSource(10000n,3000n,0n,0n,8000n)).toThrow();
 expect(()=>remittanceBalances({original:20000n,credits:3000n,paid:10000n,offset:3000n,reserved:0n,due:7000n,excess:3000n,accepted:0n})).toThrow();
 expect(()=>remittanceBalances({original:10000n,credits:0n,paid:0n,offset:0n,reserved:0n,due:9999n,excess:0n,accepted:0n})).toThrow();
});
it('allocates exact partial payments in disclosed source order without truncating or over-allocating',()=>{
 expect(allocateRemittance(7500n,[{id:'first',available:5000n},{id:'second',available:8000n}])).toEqual([{entryId:'first',amountCentavos:5000},{entryId:'second',amountCentavos:2500}]);
 expect(()=>allocateRemittance(1n,[])).toThrow();expect(()=>allocateRemittance(2n,[{id:'same',available:1n},{id:'same',available:1n}])).toThrow();expect(()=>allocateRemittance(1n,Array.from({length:21},(_,i)=>({id:String(i),available:1n})))).toThrow();
});
