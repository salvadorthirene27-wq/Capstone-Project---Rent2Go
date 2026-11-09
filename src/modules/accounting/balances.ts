import {DomainError} from '../partners/workflow';
/** Requests are a queue, not reservations. Approved unpaid requests consume capacity. */
export function ownerBalances(earned:bigint,paid:bigint,reserved:bigint,requested:bigint,credits=0n,centrallyHeld=0n){
 const max=BigInt(Number.MAX_SAFE_INTEGER);
 if([earned,paid,reserved,requested,credits,centrallyHeld].some(n=>n<0n||n>max)||credits>earned||centrallyHeld>earned-credits)throw new DomainError('Owner account totals require financial review.',409);
 const unallocated=earned-credits-paid-reserved,spendable=unallocated-centrallyHeld;
 if(unallocated < -max)throw new DomainError('Owner account recovery exceeds supported bounds.',409);
 return {centrallyHeldCentavos:Number(centrallyHeld),earnedCentavos:Number(earned),paidCentavos:Number(paid),reservedCentavos:Number(reserved),requestedCentavos:Number(requested),availableCentavos:Number(spendable>0n?spendable:0n),recoveryCentavos:Number(unallocated<0n?-unallocated:0n),creditCentavos:Number(credits),netEarnedCentavos:Number(earned-credits)};
}
