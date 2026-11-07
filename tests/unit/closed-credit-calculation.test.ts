import {it,expect} from 'vitest';
import {creditIncrement,cumulativeCredit,recipients} from '../../src/modules/accounting/credit-calculation';
import {ownerBalances} from '../../src/modules/accounting/balances';
it('conserves original recipient centavos through thousands of tiny successive credits without reversing a previous credit',()=>{
 for(const weights of [[7,1,1,1],[5,3,1,0],[1500,1500,900,500],[0,80,10,10]]){
  const original=Object.fromEntries(recipients.map((r,i)=>[r,weights[i]])) as Parameters<typeof cumulativeCredit>[0],total=weights.reduce((a,b)=>a+b,0),sum={COSIGNER:0,AGENCY:0,PLATFORM:0,MAINTENANCE:0};
  for(let n=0;n<total;n++){const delta=creditIncrement(original,n,1);expect(recipients.reduce((n,r)=>n+delta[r],0)).toBe(1);for(const r of recipients){expect(delta[r]).toBeGreaterThanOrEqual(0);sum[r]+=delta[r];expect(sum[r]).toBeLessThanOrEqual(original[r]);}}
  expect(sum).toEqual(original);
 }
});
it('rejects over-crediting and uses exact BigInt priority comparisons near the safe centavo limit',()=>{
 const original={COSIGNER:6305039478318693,AGENCY:900719925474100,PLATFORM:900719925474099,MAINTENANCE:900719925474099};
 expect(cumulativeCredit(original,Number.MAX_SAFE_INTEGER)).toEqual(original);
 expect(()=>creditIncrement({COSIGNER:7,AGENCY:1,PLATFORM:1,MAINTENANCE:1},9,2)).toThrow();
});
it('preserves gross earnings and paid history, offsets accepted recovery before new money becomes withdrawable, and excludes queued requests',()=>{
 expect(ownerBalances(21000n,20000n,0n,5000n,14000n)).toMatchObject({earnedCentavos:21000,creditCentavos:14000,netEarnedCentavos:7000,paidCentavos:20000,availableCentavos:0,recoveryCentavos:13000,requestedCentavos:5000});
 expect(ownerBalances(31000n,20000n,0n,5000n,14000n)).toMatchObject({availableCentavos:0,recoveryCentavos:3000});
 expect(ownerBalances(35000n,20000n,0n,5000n,14000n)).toMatchObject({availableCentavos:1000,recoveryCentavos:0});
 expect(()=>ownerBalances(10n,0n,0n,0n,11n)).toThrow();
});
