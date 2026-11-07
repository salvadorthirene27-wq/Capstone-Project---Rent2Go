import {DomainError} from '../partners/workflow';

export const recipients=['COSIGNER','AGENCY','PLATFORM','MAINTENANCE'] as const;
export type Recipient=typeof recipients[number];
export const recoveryConsent='I accept this exact reduction of my original earnings. If the affected earnings have already been paid, I authorize the recovery balance to be deducted from my future earnings with this agency in the same payment environment. My original payout record will remain unchanged. This does not authorize a debit from my bank account or wallet.';
export const creditRounding='Cumulative highest-averages allocation against the original recipient centavos, with ties resolved Cosigner, agency, Rent2Go, then maintenance. Each credit is the difference between cumulative allocations. A full credit reverses the original amounts exactly.';

/** Jefferson apportionment is house-monotone: later credits cannot undo earlier ones.
 * Start with lower quotas; at most three remaining cents need priority selection.
 * BigInt cross-products avoid floating-point money and priority comparisons. */
export function cumulativeCredit(original:Record<Recipient,number>,amount:number){
 const weights=recipients.map(r=>original[r]);
 if(!Number.isSafeInteger(amount)||amount<0||weights.some(n=>!Number.isSafeInteger(n)||n<0))throw new DomainError('Invalid original credit allocation.',422);
 const total=weights.reduce((n,w)=>n+BigInt(w),0n),target=BigInt(amount);
 if(total===0n||target>total)throw new DomainError('A credit cannot exceed its original revenue source.',409);
 const seats=weights.map(w=>target*BigInt(w)/total);
 let left=target-seats.reduce((n,w)=>n+w,0n);
 while(left>0n){
  let best=0;
  for(let i=1;i<4;i++)if(BigInt(weights[i])*(seats[best]+1n)>BigInt(weights[best])*(seats[i]+1n))best=i;
  seats[best]++;left--;
 }
 return Object.fromEntries(recipients.map((r,i)=>[r,Number(seats[i])])) as Record<Recipient,number>;
}
export function creditIncrement(original:Record<Recipient,number>,alreadyCredited:number,amount:number){
 if(!Number.isSafeInteger(alreadyCredited)||alreadyCredited<0||!Number.isSafeInteger(amount)||amount<1||!Number.isSafeInteger(alreadyCredited+amount))throw new DomainError('Invalid credit amount.',422);
 const before=cumulativeCredit(original,alreadyCredited),after=cumulativeCredit(original,alreadyCredited+amount);
 return Object.fromEntries(recipients.map(r=>[r,after[r]-before[r]])) as Record<Recipient,number>;
}
