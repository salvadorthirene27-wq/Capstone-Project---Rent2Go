# Closed-booking credits and accepted earnings recovery

A financial close, original allocation and paid payout remain immutable. A later refund of retained revenue uses a separate credit against one exact original service or extra-charge source. It does not reopen a vehicle, change physical fulfillment, change the original quotation, refund a deposit twice, or create a new charge after closing.

## Review and posting

1. An independent current agency operator selects an original revenue source and proposes a positive credit within its remaining original basis. The explanation is shared with the renter and affected original Cosigner. Only one unresolved proposal can exist for a booking. A dispute or withdrawal permits a corrected proposal with new exact terms; earlier decisions stay preserved.
2. The renter reviews the fixed amount, source, service dates and reason. Acceptance recognizes the proposed credit, not a completed refund payment. A dispute requires a reason.
3. When the credit reduces a Cosigner allocation, the original ledger beneficiary receives a separate minimized packet. It contains the agency, own vehicle/service dates, source, original owner earnings, earlier owner reductions, this exact reduction and explicit future-earnings recovery consent. It excludes renter identity, documents, mixed-cart totals, payout credentials and other recipients' allocations. Current vehicle ownership cannot redirect historical consent.
4. The Cosigner can accept or dispute only after renter acceptance. Acceptance expressly authorizes offsetting any resulting recovery balance against future earnings with the same agency in the same manual/simulated environment. It does not authorize a bank/wallet debit. A zero owner reduction needs no owner consent.
5. An independent operator posts only the exact accepted document. Approved unpaid withdrawals on the affected owner account must first be paid/resolved or revoked; pending payout results cannot be bypassed. Booking, ordered owner-account and current authority locks serialize posting with approvals and payouts. Queued requests remain unreserved and are checked against the new balance when reviewed.
6. Posting creates one immutable credit and four conserved compensating recipient entries. Original close, gross allocation, paid payout, payout debit and physical booking status stay unchanged. A deferred database check requires the original parties' exact acceptance, four original-source entries and exact conservation. Neither a source nor an original recipient allocation can be over-reversed.

## Centavo allocation

Credits use cumulative highest-averages allocation against the original four recipient centavo amounts, with ties resolved Cosigner, agency, Rent2Go, then maintenance. A later credit records the difference from the earlier cumulative allocation. This keeps every increment nonnegative, conserves every credit and fully reverses the original recipient amounts at a full source credit. BigInt arithmetic avoids floating-point money and priority comparisons. The exact proposed owner amount is disclosed for acceptance.

## Refund execution is separate

A posted credit creates refund capacity, not a paid refund. The renter selects that credit and an original collection, requests an amount, and obtains independent agency approval. Pending requests consume the credit's allowance; approved requests additionally reserve original-collection capacity. Rejected or withdrawn/revoked unpaid requests release their relevant capacity. Already paid amounts continue to consume it.

Closed-booking refund mutations are permitted only for records explicitly linked to a posted credit for the same request, quotation and payment environment. Original closed refunds remain frozen. Both the credit ceiling and the existing collection ceiling apply under the booking lock. The pre-close assessment retention guard remains unchanged for ordinary refunds; the posted, separately accepted compensating credit supplies the closed-booking entitlement.

Manual execution still requires an actual external-payment attestation, unique outgoing reference and private evidence. Fixed simulated outcomes remain labeled and transfer no money. Failed/pending outcomes do not become paid refunds; pending simulations require exact resolution. Evidence and receipts retain the original renter/current agency privacy boundary; Cosigner credit consent grants no access to them.

## Owner balances

Net earned = original posted owner earnings minus posted accepted owner credits.

Available = max(net earned minus historical paid debits minus approved unpaid reservations, 0).

Recovery = max(historical paid debits plus reservations minus net earned, 0).

Posting requires no affected approved unpaid reservations, so a newly created recovery reflects already-paid earnings. The original paid debit is not rewritten. Subsequent closed earnings reduce this derived recovery balance before creating new withdrawal capacity; no fictitious transfer or second payout debit is inserted. Queued requests do not reserve money. Different agencies and manual/simulated environments never offset each other. Refundable deposits and maintenance reserves never become withdrawable owner earnings.

For example, PHP210 original owner earnings with PHP200 already paid and PHP140 accepted owner credit produce PHP70 net earned and PHP130 recovery. Later PHP70 earnings reduce recovery to PHP60; another PHP70 leaves PHP10 available. The PHP200 payout record remains unchanged throughout.

## Interface, reports and notifications

Closed booking pages link to saved credit reviews. Owner earnings pages show gross, accepted credits, net earned, paid, reserved, available and recovery amounts separately, plus paginated private credit reviews. Generic booking/owner notifications and safe audit records are saved in the same transaction. Normal email dispatch remains controlled by the independent email configuration; this module sends no messages itself.

Agency and owner reports include a separate posted-credits statement and CSV export. Reductions use their own posting timestamp, not the original close date. Charts retain clearly labeled original allocations; reductions are separate positive figures, avoiding misleading negative chart bars. Platform agency aggregates show original revenue, revenue reductions, original platform allocations and platform reductions separately, with no individual owner/renter details. Future remittance balances must use original allocations minus posted credits.

Migration034 is additive. Tests cover exact consent/privacy, original payout immutability, source and recipient ceilings, restricted-role posting, separately bounded refund payment, reports, future-earnings recovery and posting/withdrawal approval races. Final execution evidence is recorded in STATUS.md.

Verification checkpoint,8 November2026:372 unit/UI/route checks in87files,24 credit/withdrawal/refund/report DB cases across4files plus1 separate posting/approval race. The final4 credit DB cases include restricted-role posting, cumulative source ceilings and future-earnings recovery. A9-case focused UI rerun validates the shorter acknowledgment and stale/retry behavior. Production build and sequential TypeScript pass. Actual synthetic owner/agency1440px/375px and owner812px landscape pages fit without body overflow; checkbox acknowledgment enables acceptance and clearing it disables acceptance, without submitting owner consent. The independent agency has no posting control while owner consent is missing. Four-role HTTP evidence and private app-only before/after exports are stored outside Git. The unposted walkthrough proposal is withdrawn; original application ledgers and pending withdrawal remain unchanged. No actual transfer, provider charge or email was executed. These checks are not formal human usability results or a full managed-Auth/object restore.
