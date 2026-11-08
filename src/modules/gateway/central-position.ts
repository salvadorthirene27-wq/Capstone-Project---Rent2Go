import {z} from 'zod';
import {DomainError} from '../partners/workflow';

const cents=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const centralPositionInput=z.object({
  collectedCentavos:cents,refundedCentavos:cents,providerFeesCentavos:cents,
  retainedDepositCentavos:cents,
  allocations:z.object({cosigner:cents,agency:cents,platform:cents,maintenance:cents}).strict(),
  agencyFundingCentavos:cents,disbursedCentavos:cents,financiallyClosed:z.boolean(),
}).strict();
export type CentralPositionInput=z.infer<typeof centralPositionInput>;
const zero=0n;
const positive=(value:bigint)=>value>zero?value:zero;
function number(value:bigint){
  if(value>BigInt(Number.MAX_SAFE_INTEGER)||value<BigInt(Number.MIN_SAFE_INTEGER))throw new DomainError('Central payment totals exceed supported bounds.',409);
  return Number(value);
}

/** Projection only. Inputs must be independently loaded from immutable provider,
 * allocation/refund and reviewed disbursement records; never accept these totals
 * from a renter. A proposed recovery is not an accepted future offset. */
export function centralPosition(value:unknown){
  const v=centralPositionInput.parse(value),a=v.allocations;
  const collected=BigInt(v.collectedCentavos),refunded=BigInt(v.refundedCentavos),fees=BigInt(v.providerFeesCentavos),deposit=BigInt(v.retainedDepositCentavos);
  const owner=BigInt(a.cosigner),agency=BigInt(a.agency),platform=BigInt(a.platform),maintenance=BigInt(a.maintenance),funding=BigInt(v.agencyFundingCentavos),disbursed=BigInt(v.disbursedCentavos);
  if(refunded>collected||owner+agency+platform+maintenance+deposit!==collected-refunded)throw new DomainError('Reconcile provider collections, refunds, deposit custody and accepted allocations first.',409);
  // Fees can survive a full gross refund. Preserve that agency obligation even
  // when the provider cash position becomes negative; never clamp the debt away.
  const agencyNet=positive(agency-fees),feeShortfall=positive(fees-agency);
  const combined=owner+maintenance+agencyNet;
  const remaining=positive(combined-disbursed),recovery=positive(disbursed-combined);
  const cash=collected-refunded-fees+funding-disbursed;
  const reserved=platform+deposit;
  const fundingNeeded=positive(reserved+remaining-cash);
  // No partial release that could conceal a fee shortfall against protected
  // Cosigner/maintenance obligations. Actual disbursement remains a new review.
  const releasable=v.financiallyClosed&&recovery===zero&&fundingNeeded===zero?remaining:zero;
  return {
    feeBearer:'AGENCY' as const,
    originalAllocations:{...a},
    retainedDepositCentavos:number(deposit),
    heldPlatformCommissionCentavos:number(platform),
    platformRemittanceDueCentavos:0,
    agencyNetShareCentavos:number(agencyNet),
    agencyFeeShortfallCentavos:number(feeShortfall),
    combinedAgencyEntitlementCentavos:number(combined),
    alreadyDisbursedCentavos:number(disbursed),
    remainingAgencyEntitlementCentavos:number(remaining),
    proposedAgencyRecoveryCentavos:number(recovery),
    centralCashCentavos:number(cash),
    additionalAgencyFundingNeededCentavos:number(fundingNeeded),
    unallocatedAgencyFundingCentavos:number(positive(cash-reserved-remaining)),
    availableForDisbursementCentavos:number(releasable),
    blockedReason:!v.financiallyClosed?'Financial closing is required before agency disbursement.':recovery>zero?'A separately reviewed agency recovery is required.':fundingNeeded>zero?'Agency funding is required to preserve the agreed owner, maintenance and platform amounts.':null,
  };
}
