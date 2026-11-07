import {it,expect} from 'vitest';
import {ownerBalances} from '../../src/modules/accounting/balances';
import {withdrawalCommand,payoutEvidenceCommand} from '../../src/modules/accounting/schema';
import {randomUUID} from 'node:crypto';
it('keeps queued requests distinct from reserved and paid owner earnings',()=>{
 expect(ownerBalances(21000n,4000n,7000n,30000n)).toEqual({earnedCentavos:21000,paidCentavos:4000,reservedCentavos:7000,requestedCentavos:30000,availableCentavos:10000,recoveryCentavos:0});
});
it('shows a recovery obligation rather than inventing spendable money when paid and reserved exceed earnings',()=>{
 expect(ownerBalances(5000n,7000n,1000n,0n)).toMatchObject({availableCentavos:0,recoveryCentavos:3000});
 expect(()=>ownerBalances(-1n,0n,0n,0n)).toThrow();expect(()=>ownerBalances(0n,BigInt(Number.MAX_SAFE_INTEGER),BigInt(Number.MAX_SAFE_INTEGER),0n)).toThrow();
});
it('requires explicit actual-payout attestation and rejects client-supplied recipient overrides',()=>{
 const base={version:1,idempotencyKey:randomUUID(),withdrawalId:randomUUID(),reference:'SYNTHETIC-TRANSFER',reason:'Synthetic execution evidence'};
 expect(payoutEvidenceCommand.safeParse(base).success).toBe(false);expect(payoutEvidenceCommand.safeParse({...base,externalPaid:false}).success).toBe(false);expect(payoutEvidenceCommand.safeParse({...base,externalPaid:true,amountCentavos:1}).success).toBe(false);
 expect(payoutEvidenceCommand.parse({...base,externalPaid:true}).externalPaid).toBe(true);
});
it('requires a destination for account-based methods and exact integer centavos',()=>{
 const c={action:'REQUEST_WITHDRAWAL',version:1,idempotencyKey:randomUUID(),amountCentavos:1,method:'GCASH',destination:{name:'Synthetic owner',account:''},reason:'Owner request'};
 expect(withdrawalCommand.safeParse(c).success).toBe(false);expect(withdrawalCommand.safeParse({...c,method:'CASH'}).success).toBe(true);expect(withdrawalCommand.safeParse({...c,method:'CASH',amountCentavos:0.5}).success).toBe(false);
});
