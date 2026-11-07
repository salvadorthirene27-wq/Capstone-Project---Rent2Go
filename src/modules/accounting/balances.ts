import {DomainError} from '../partners/workflow';
/** Requests are a queue, not reservations. Approved unpaid requests consume capacity. */
export function ownerBalances(earned:bigint,paid:bigint,reserved:bigint,requested:bigint){
 const max=BigInt(Number.MAX_SAFE_INTEGER);
 if([earned,paid,reserved,requested].some(n=>n<0n||n>max))throw new DomainError('Owner account totals require financial review.',409);
 const unallocated=earned-paid-reserved;
 if(unallocated < -max)throw new DomainError('Owner account recovery exceeds supported bounds.',409);
 return {earnedCentavos:Number(earned),paidCentavos:Number(paid),reservedCentavos:Number(reserved),requestedCentavos:Number(requested),availableCentavos:Number(unallocated>0n?unallocated:0n),recoveryCentavos:Number(unallocated<0n?-unallocated:0n)};
}
