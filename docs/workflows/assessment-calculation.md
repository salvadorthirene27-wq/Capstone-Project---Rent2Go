# Financial assessment calculations

The calculation engine accepts server-resolved quotation lines, delivery facts, explicit service credits and exact extra-charge policy snapshots. It does not authorize an actor, establish policy approval, save an assessment, obtain consent or move money. Callers must use the approved-policy resolver and preserve the original quotation/ownership context; a matching digest verifies content integrity rather than permission.

Delivered service revenue includes the quoted driver fee. Refundable deposits remain visible as quoted liabilities and are excluded from revenue. Undelivered/cancelled lines start with zero earned service revenue; retention requires an explicit configured cancellation item and eventual renter consent. Credits cannot exceed the delivered value of their own line. Charges must match the exact line's ownership/service context and delivery state, contain an explicit reviewed policy version/digest and explanation, and retain all allocation percentages. No fee amount or penalty is inferred.

Reconciliation is scoped to one quotation and one MANUAL or DEMO environment. It uses complete original collection/refund history, not paginated interface projections. Each paid or reserved refund is bounded by its exact collection. Paid refunds reduce held funds; approval reserves funds without claiming payment. Rejected/withdrawn/revoked proposals do not consume capacity; pending reviews and manual evidence remain unresolved work. Duplicate IDs, orphan refunds, mixed environments/quotes, fractional/negative amounts and unsafe integer totals fail closed.

Outstanding refunds include remaining deposits and credit as part of actual net funds above the accepted obligation; the engine does not claim which deposit component has already been returned by an older unclassified refund. Reserved refunds are disclosed separately and can expose a projected shortage. Additional balance and refund due cannot both be positive for the same reconciled scope. All sums use integer centavos with checked BigInt accumulation. No deposit or overpayment enters an earnings split.

`monetaryRequirementsSatisfied` describes amounts only. Financial closure also requires authoritative fulfillment, current accepted return reports, exact accepted financial terms, any required Cosigner allocation agreement, resolved evidence/reviews, immutable ledger posting and appropriate cancellation identity. It must never be used alone to mark a booking completed.

## Integration status

1. Implemented: under a parent booking lock, authorize the independent agency operator; bind the exact immutable quotation, saved ownership and latest physical/condition facts. Resolve approved allocation snapshots on the server, never from client claims.
2. Implemented: append-only versioned itemized proposals, exact renter acceptance/dispute and corrected revisions preserve old accepted contracts. Condition acknowledgement does not accept charges. Owner-specific financial agreements remain an additional settlement requirement.
3. Apply deposit dispositions and collect additional balances through separately scoped payment records; include all historical refunds/reservations. Constrain later refund approval against retained accepted obligations as well as original source capacity.
4. Close finances only after all prerequisites, post conserved allocation ledgers once, and handle later receipts/refunds with compensating history rather than reopening inventory or overwriting signed terms.

The initial calculation checkpoint was followed by migration024 and the assessment-review API/UI. Native database connectivity subsequently recovered with the existing credentials and driver. Steps3–4 remain open; see `assessment-review.md` for the implemented review boundary and verification evidence.
