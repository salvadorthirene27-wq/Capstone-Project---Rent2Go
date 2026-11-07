import {DomainError} from '../partners/workflow';
const max=BigInt(Number.MAX_SAFE_INTEGER);
function supported(values:bigint[]){if(values.some(n=>n<0n||n>max))throw new DomainError('Remittance amounts require financial review.',409);}

/** A source is an original immutable PLATFORM entry, never a deposit or owner share.
 * Recorded cash and accepted-credit applications are distinct forms of settlement.
 * An excess on one source must not silently net against another source. */
export function remittanceSource(original:bigint,credits=0n,paid=0n,offset=0n,reserved=0n){
 supported([original,credits,paid,offset,reserved]);
 if(credits>original||paid+offset>original)throw new DomainError('A remittance source exceeds its original allocation.',409);
 const net=original-credits,settled=paid+offset,remaining=net>settled?net-settled:0n,excess=settled>net?settled-net:0n;
 if(reserved>remaining)throw new DomainError('Resolve unpaid remittance reservations before reducing this source.',409);
 return {originalCentavos:Number(original),creditCentavos:Number(credits),netCentavos:Number(net),paidCentavos:Number(paid),offsetCentavos:Number(offset),reservedCentavos:Number(reserved),dueCentavos:Number(remaining-reserved),excessCentavos:Number(excess)};
}
export type RemittanceTotals={original:bigint;credits:bigint;paid:bigint;offset:bigint;reserved:bigint;due:bigint;excess:bigint;accepted:bigint};
/** Database aggregates by agency and payment environment before calling this.
 * Excess includes prior credit applications subsequently reversed by a refund.
 * Accepted credits remain separately conserved: grants minus actual applications. */
export function remittanceBalances(t:RemittanceTotals){
 supported(Object.values(t));
 if(t.credits>t.original||t.paid+t.offset>t.original||t.accepted>t.excess||t.offset>t.accepted||t.original-t.credits-t.paid-t.offset-t.reserved!==t.due-t.excess)throw new DomainError('Remittance source and agency credit totals do not reconcile.',409);
 const available=t.accepted-t.offset,pending=t.excess-t.accepted,applicable=available<t.due?available:t.due;
 return {originalCentavos:Number(t.original),creditCentavos:Number(t.credits),paidCentavos:Number(t.paid),offsetCentavos:Number(t.offset),reservedCentavos:Number(t.reserved),dueCentavos:Number(t.due),excessCentavos:Number(t.excess),acceptedCreditCentavos:Number(t.accepted),availableCreditCentavos:Number(available),awaitingAcceptanceCentavos:Number(pending),applicableCreditCentavos:Number(applicable),dueAfterAvailableCreditCentavos:Number(t.due-applicable)};
}
/** Input order is authoritative close timestamp / entry ID order from the DB.
 * Each bounded action discloses its exact original entries and allocated cents. */
export function allocateRemittance(amount:bigint,sources:{id:string;available:bigint}[]){
 supported([amount,...sources.map(s=>s.available)]);
 if(amount===0n||sources.length>20||new Set(sources.map(s=>s.id)).size!==sources.length)throw new DomainError('Choose a positive remittance against at most twenty distinct original sources.',422);
 let remaining=amount;const allocations:{entryId:string;amountCentavos:number}[]=[];
 for(const source of sources){const applied=remaining<source.available?remaining:source.available;if(applied>0n)allocations.push({entryId:source.id,amountCentavos:Number(applied)});remaining-=applied;if(remaining===0n)break;}
 if(remaining>0n)throw new DomainError('This amount exceeds the disclosed original-source capacity.',409);
 return allocations;
}
