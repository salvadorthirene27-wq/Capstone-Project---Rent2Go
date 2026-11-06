# Settlement and accounting

The agency prepares a separate exact fund disposition after the renter accepts the current itemized assessment and each affected Cosigner accepts the own-vehicle extra charges or service credits. Acceptance creates neither a collection nor a payout. A changed assessment, inspection, service outcome or consent blocks using old settlement terms.

## Workflow

1. Complete physical service, approved cancellation or unpaid-reservation expiry. Preserve that actual outcome.
2. Prepare the itemized assessment using the saved quote, delivered services, per-line credits and approved extra-charge policies. Obtain exact renter acceptance and applicable separate owner acceptance.
3. Resolve outstanding payment submissions and refund work. The agency proposes settlement, disclosing earned services, accepted extras, the quoted deposit, confirmed funds, prior refunds, fund application, remaining refund and additional balance.
4. The renter accepts or disputes that exact version. A pending version can be withdrawn and corrected without deleting its history. Changed financial facts block pending acceptance. Once accepted, intended collections/refunds change the running reconciliation, without changing the accepted business terms.
5. Record any additional balance in its own settlement-linked payment stream using saved accepted methods. Cash is recorded as actually received; GCash proof requires independent agency review. Simulated card, GCash and PayPal outcomes remain explicitly identified and isolated from manual funds. Submitted funds that arrive after terms change remain a reconciliation liability; they do not reclaim inventory.
6. Return net excess through the existing reviewed, original-collection-linked refund workflow. Approval reserves capacity; separate execution records payment. Additional-payment overpayments remain refundable credit.
7. An authorized agency operator closes only when exact accepted business terms still match, all balances and refunds are reconciled, no pending payment/refund work remains and no physical resource is out. Delivered service becomes COMPLETED. Cancelled bookings remain CANCELLED; expired reservations remain HOLD_EXPIRED.
8. Closing atomically records immutable owner, agency, platform and maintenance entries. It does not execute a withdrawal, platform remittance or bank transfer.

## Financial invariants

- Apply confirmed net held funds to accepted services, then accepted extras. The remaining excess is refundable; any shortfall is an additional balance. A quoted deposit is not evidence of a collected deposit.
- Rental revenue includes the original driver fee. Original accepted financial snapshots govern service splits; exact separately accepted extra-charge snapshots govern extras. Refundable deposits and service credits do not become earnings.
- Every positive service/extra source has four explicit recipient entries whose shares total 100%. Whole-centavo largest-remainder rounding conserves the source amount. Equal remainder ties use Cosigner, agency, platform, maintenance order, disclosed in consent.
- Owner earnings are attributable to the original owner and vehicle. Agency and maintenance amounts are not owner-withdrawable. Manual and simulated environments never mix.
- Original quotation collections exclude additional balance collections in their original-payment totals; refund and reconciliation totals include all matching confirmed sources. Printable balance collections name their exact accepted settlement.
- Parent booking and ordered current-authority locks protect mutations. Exact retries return the saved result; changed payloads with reused keys fail. Runtime permissions and append-only/deferred database constraints protect ledger conservation.
- Renter settlement responses omit private recipient allocations and owner identity. Cosigners receive only the separate minimized own-vehicle packet, never the full mixed booking.
- Closed financial facts cannot be silently edited by existing assessment, collection, refund, inspection or owner-review commands. A future explicit compensating adjustment and recovery workflow must preserve the original close and ledger; it is not implied by this module.

## Evidence and limitations

Verification:288 unit/UI cases in66 files;58 distinct settlement, owner-review, assessment, refund, payment, fulfillment and cancellation database cases;41 live synthetic API checks;4 final read-only closed-history checks;45 navigation/page checks; all7 public sample images independently decoded; production build and sequential TypeScript. Actual agency/renter screens were reviewed at1440px and375px, with812px landscape wrapping checked. Saved additional receipts remain accessible after closing. The31 original payment/fulfillment/cancellation cases passed across the initial29 successes and targeted reruns of two PG-deadline timeout cases. Timing budgets changed only for those two real-clock/network cases, without removing assertions. The final restricted-role closed-history case also passed. No live gateway or actual funds transfer is performed. Payouts, reports, notifications and OCR are separate modules.
