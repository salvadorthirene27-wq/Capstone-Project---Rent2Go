import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {remittanceCommand,remittanceEvidenceCommand,remittanceQuery} from '../../src/modules/accounting/remittance-schema';
const base={version:1,idempotencyKey:randomUUID()},exact={remittanceId:randomUUID(),digest:'a'.repeat(64)};
it('requires exact agency acceptance before creating or applying carry and rejects forged actor or cross-account overrides',()=>{
 const credit={...base,action:'ACCEPT_AGENCY_CREDIT',entryId:randomUUID(),creditDigest:'b'.repeat(64),consent:true};
 expect(remittanceCommand.safeParse(credit).success).toBe(true);expect(remittanceCommand.safeParse({...credit,consent:false}).success).toBe(false);expect(remittanceCommand.safeParse({...credit,actorId:'someone-else'}).success).toBe(false);expect(remittanceCommand.safeParse({...credit,agencyId:randomUUID()}).success).toBe(false);
 const apply={...base,action:'APPLY_AGENCY_CREDIT',sourcePage:1,sourceDigest:'c'.repeat(64),creditDigest:'d'.repeat(64),amountCentavos:1,consent:true};expect(remittanceCommand.safeParse(apply).success).toBe(true);expect(remittanceCommand.safeParse({...apply,amountCentavos:0.5}).success).toBe(false);
});
it('keeps manual outgoing-payment claims and platform receipt attestations separate',()=>{
 const proof={...base,...exact,action:'SUBMIT_REMITTANCE_PROOF',reference:'SYNTHETIC-REFERENCE',note:'Synthetic claim only',externalPaid:true};expect(remittanceEvidenceCommand.safeParse(proof).success).toBe(true);expect(remittanceEvidenceCommand.safeParse({...proof,externalReceived:true}).success).toBe(false);
 const review={...base,...exact,action:'REVIEW_REMITTANCE',attemptId:randomUUID(),decision:'ACCEPT',externalReceived:true,reason:'Actual receipt independently verified'};expect(remittanceCommand.safeParse(review).success).toBe(true);expect(remittanceCommand.safeParse({...review,externalReceived:false}).success).toBe(false);expect(remittanceCommand.safeParse({...review,decision:'REJECT'}).success).toBe(false);expect(remittanceCommand.safeParse({...review,decision:'REJECT',externalReceived:false}).success).toBe(true);
});
it('requires a bounded exact source preview before reserving dues and rejects undisclosed amount expansion',()=>{
 const request={...base,action:'REQUEST_REMITTANCE',sourcePage:1,sourceDigest:'a'.repeat(64),amountCentavos:100,method:'DEMO_GCASH',reason:'Synthetic source reservation',consent:true};expect(remittanceCommand.safeParse(request).success).toBe(true);expect(remittanceCommand.safeParse({...request,sourcePage:0}).success).toBe(false);expect(remittanceCommand.safeParse({...request,sources:[{entryId:randomUUID(),amountCentavos:100}]}).success).toBe(false);
 expect(remittanceQuery.safeParse({environment:'DEMO',sourcePage:10001}).success).toBe(false);expect(remittanceQuery.safeParse({ownerId:'foreign'}).success).toBe(false);
});
