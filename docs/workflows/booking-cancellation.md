# Pre-service cancellation and inventory release

Authority: approved refined manuscript pages31,34,55 and the approved design's cancellation/refund boundaries. This workflow cancels all services in one agency's request; mixed-agency carts already produce separate requests. Partial delivered-service changes, early returns, no-shows and agency service failures require separate review.

## Request and exact review

Only the active renter requests cancellation, with a reason. The server preserves the current quotation reference/digest (if any), service dates and exact cancellation/refund/damage/late policies from the request's original snapshots. A pending request pauses document changes, quotation changes, agreement issue/signing, new payment submissions/simulations and service delivery. Independent review of previously submitted manual payment evidence remains available so real receipt facts are not hidden.

Requesting cancellation does not release inventory or extend a deadline. The normal worker may still expire an unpaid hold. Rejecting or withdrawing a request retains the actual current lifecycle stage; it never restores an earlier deadline or silently recreates inventory. A changed booking version requires reload. Each action has an actor-scoped exact retry key/body, and a key cannot be reused for a different action.

An independent active agency operator approves or declines the exact pending request ID/digest with a recorded reason. The renter may withdraw only that pending request. A renter who is also an agency member cannot approve their own request. Super Admin and unrelated Cosigner roles have no implicit access to private cancellation records. Historical requests/decisions remain immutable and visible to permitted participants, including rejection/withdrawal reasons and preserved policies.

## Delivery boundary and concurrent actions

Standard cancellation is unavailable after any actual vehicle handover or tour start, including after later physical return or tour completion. The server checks persisted physical history, not only an aggregate status label. Cancellation and all progression commands lock the same mutable booking request, so a concurrent cancellation request and service start cannot both succeed. Active agency/actor/membership authority is rechecked under ordered locks.

## Approval and funds

Approval locks the remaining hold, ordered vehicle/driver resources and tour departures. It cancels remaining scheduled claims, decrements group seats or the private slot once, and records the explicit CANCELLED hold-release reason. Committed allocations are released through this reviewed path; quote expiry cannot release confirmed committed stock. Historical allocations, signature evidence and collection records remain intact.

With no confirmed collection or pending manual receipt, the request becomes CANCELLED. Otherwise it becomes CANCELLED_RECONCILIATION_PENDING. A late confirmed manual receipt remains a cancellation reconciliation liability without reclaiming released stock. Existing deposits and overpayment credit remain separate financial facts.

Cancellation approval does not calculate a refund, assign a penalty, pay money, settle deposits or post earnings. No cancellation percentage or refund formula is inferred from free-text policies. Reviewed financial assessment, accepted deductions and separately evidenced refund payment follow in the reconciliation module. Demo identities remain explicit; synthetic manual demo records are not proof of actual funds.

## Verification boundary

Domain/interface/route checks verify reasons, exact references, consent feedback, foreign origin, stale locks and uncertain-result retries. Isolated database cases cover scope, funding/history preservation, committed stock, restricted runtime, unpaid expiry and concurrent service start. Live HTTP uses synthetic managed-Auth accounts and records. Final evidence is maintained in STATUS.md; no human usability or authenticated browser-layout success is inferred from HTTP checks.
