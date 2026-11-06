import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {splitCentavos,fundApplication,revenueAllocations,sumCents} from '../../src/modules/bookings/settlement-calculation';
import {calculateAssessmentProposal} from '../../src/modules/bookings/assessment-calculation';
const shares={cosigner:7000,agency:1000,platform:1000,maintenance:1000};
it('conserves whole centavos at small values, awkward remainders and the safe-integer boundary',()=>{
 for(const amount of [0,1,2,3,7,99,101,99999,Number.MAX_SAFE_INTEGER]){const result=splitCentavos(amount,shares);expect(sumCents(Object.values(result))).toBe(amount);expect(Object.values(result).every(Number.isSafeInteger)).toBe(true);}
 expect(splitCentavos(3,shares)).toEqual({cosigner:2,agency:1,platform:0,maintenance:0});
 expect(splitCentavos(1,{cosigner:2500,agency:2500,platform:2500,maintenance:2500})).toEqual({cosigner:1,agency:0,platform:0,maintenance:0});
});
it('rejects incomplete, overflowing and non-integral allocations instead of rounding money inputs',()=>{
 expect(()=>splitCentavos(100,{...shares,agency:1001})).toThrow();expect(()=>splitCentavos(1.1,shares)).toThrow();expect(()=>sumCents([Number.MAX_SAFE_INTEGER,1])).toThrow();
});
it('discloses held-fund use and conserves both a deposit refund and an additional balance',()=>{
 expect(fundApplication(1130000,10000,1420000)).toMatchObject({obligationCentavos:1140000,extraAppliedCentavos:10000,refundDueCentavos:280000,additionalBalanceCentavos:0});
 expect(fundApplication(1130000,500000,1420000)).toMatchObject({obligationCentavos:1630000,extraAppliedCentavos:290000,refundDueCentavos:0,additionalBalanceCentavos:210000});
 expect(fundApplication(0,0,1).refundDueCentavos).toBe(1);
});
it('posts only earned service after credits and excludes the quoted deposit from owner earnings',()=>{
 const lineId=randomUUID(),proposal=calculateAssessmentProposal({lines:[{lineId,title:'Own car',context:'CONSIGNED',delivered:true,serviceCentavos:10000,refundableDepositCentavos:20000}],credits:[{id:randomUUID(),lineId,amountCentavos:1000,reason:'Agreed service credit'}],charges:[]}),financial=[{line_id:lineId,private_financial_snapshot:{category:'CONSIGNED',shares,vehicleId:randomUUID(),cosignerId:'owner'}}];
 const rows=revenueAllocations(proposal,financial);expect(rows).toHaveLength(4);expect(sumCents(rows.map(e=>e.amountCentavos))).toBe(9000);expect(rows.find(e=>e.recipient==='COSIGNER')!.amountCentavos).toBe(6300);expect(rows.every(e=>e.basisCentavos===9000)).toBe(true);
 expect(()=>revenueAllocations(proposal,[])).toThrow(/every service/);expect(()=>revenueAllocations(proposal,[{...financial[0],private_financial_snapshot:{...financial[0].private_financial_snapshot,cosignerId:undefined}}])).toThrow(/owner/);
});
