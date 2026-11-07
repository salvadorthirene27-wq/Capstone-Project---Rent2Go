import {it,expect} from 'vitest';
import {calendarDate,reportWindow,exportCommand} from '../../src/modules/reports/schema';
import {csvDocument,phpDecimal} from '../../src/modules/reports/csv';
it('rejects rollover dates and limits inclusive reporting windows without dropping valid leap dates',()=>{
 expect(calendarDate.safeParse('2026-02-29').success).toBe(false);expect(calendarDate.parse('2028-02-29')).toBe('2028-02-29');expect(()=>reportWindow({from:'2026-11-08',to:'2026-11-07'},'2026-11-07','AGENCY')).toThrow();expect(()=>reportWindow({from:'2026-01-01',to:'2027-01-02'},'2026-11-07','AGENCY')).toThrow();
 expect(reportWindow({to:'2025-03-12'},'2026-11-07','OWNER')).toMatchObject({from:'2025-03-01',to:'2025-03-12',environment:'MANUAL',record:'ALLOCATIONS'});
});
it('prevents owner collection/refund access and requires explicit export intent and purpose',()=>{
 expect(()=>reportWindow({record:'COLLECTIONS'},'2026-11-07','OWNER')).toThrow();expect(()=>reportWindow({record:'ALLOCATIONS'},'2026-11-07','PLATFORM')).toThrow();expect(exportCommand.safeParse({scope:{type:'OWNER',ownerId:'foreign'},filters:{},purpose:'Own statement',acknowledged:true}).success).toBe(false);expect(exportCommand.safeParse({scope:{type:'OWNER'},filters:{},purpose:'Own statement',acknowledged:false}).success).toBe(false);
});
it('quotes multiline CSV cells and neutralizes formulas hidden behind whitespace, controls or Unicode',()=>{
 for(const text of ['=HYPERLINK("https://foreign.test")',' \t+SUM(A1:A2)','\u0001@SUM(A1)','\u200B＝1+1','-formula'])expect(csvDocument(['Label'],[[text]])).toContain('"\'');
 const csv=csvDocument(['Description','Centavos'],[['Vehicle "One"\r\nSecond line',100001]]);expect(csv).toContain('"Vehicle ""One""\r\nSecond line","100001"');expect(()=>csvDocument(['One'],[[1,2]])).toThrow();expect(()=>csvDocument(['One'],[[Infinity]])).toThrow();
});
it('preserves centavo precision in PHP decimal text even near the safe integer limit',()=>{
 expect(phpDecimal(1)).toBe('0.01');expect(phpDecimal(-1)).toBe('-0.01');expect(phpDecimal(Number.MAX_SAFE_INTEGER)).toBe('90071992547409.91');expect(()=>phpDecimal(10.001)).toThrow();
});

it('limits remittance receipts and credit statements to agency or platform finance scopes',()=>{
 for(const record of ['REMITTANCES','AGENCY_CREDITS','CREDIT_APPLICATIONS']){
  expect(()=>reportWindow({record},'2026-11-08','OWNER')).toThrow();
  expect(reportWindow({record},'2026-11-08','AGENCY').record).toBe(record);
  expect(reportWindow({record},'2026-11-08','PLATFORM').record).toBe(record);
 }
});
