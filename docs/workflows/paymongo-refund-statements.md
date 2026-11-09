# Refund evidence and exact-source disbursement statements

## Implemented boundary

The provider client can retrieve and validate a refund by its exact provider ID using an authenticated, bounded, nonredirecting GET. It does not issue refunds. The application projection keeps only source identity, PHP amount, mode, status, provider timestamps and the opaque Rent2Go reference. Notes, arbitrary metadata, billing and payout details are omitted. A different returned ID, malformed resource, invalid amount/time or test/live substitution fails closed. Transport errors are sanitized and never trigger a second request automatically.

A separately saved refund intent must match the original payment, merchant fingerprint, environment, exact amount, opaque reference and any previously stored provider mapping. The original gross bounds the intent. An unrelated dashboard refund can be retrieved for future independent reconciliation but cannot be silently attributed to an application intent without its matching reference. These checks are internal contracts; durable approval/dispatch/observation records are still required before enabling a mutation route.

Verified observations can advance pending/processing refunds to a terminal state. Older nonterminal evidence cannot undo a later observation. Changed identity, contradictory terminal results and a new status regression require reconciliation. A provider success is not proof that the renter already sees the credit in their bank account.

The refund-budget calculator reserves prepared, dispatching, unknown, pending and processing amounts against the original payment gross. It rejects mixed payment/merchant/environment sources, duplicate internal/provider identities and over-allocation. Verified successful refunds consume the budget; failed attempts and proven never-dispatched cancellations release only their own reservation. An uncertain result never becomes a failure just to make funds available. This calculation does not reverse provider fees or post a refund ledger entry.

## Disbursement calculation connected to custody

The scoped central-custody service now loads original provider receipt, checkout, collection and closed revenue-entry identities. A deterministic statement pins those exact sources, beneficiary identities, environment, gross, provider fees and net, with a canonical source digest. Each receipt and entry must belong to the same booking, agency, quotation and closing. Duplicate source identities, mismatched conservation, unposted receipts and unresolved work are rejected or withheld.

Fees are attributed exclusively to original agency entries. Integer largest remainders and stable entry-ID tie breaking preserve every cent regardless of query order. Cosigner and maintenance entries retain their exact amounts; platform commission stays central. If fees exceed the agency portion, the statement preserves the protected allocations and reports required agency funding while keeping the releasable amount zero. Retained deposits, recorded refunds and later revenue credits currently withhold a statement pending their exact adjustment workflow.

This is a read-only calculation, not a durable statement approval, bank settlement, agency transfer or owner-availability release. `canDisburse` and `canExecute` remain false and released owner funds remain zero. Existing source ledgers and payouts are unchanged. The primary baseline without gateway tables still returns the same unavailable custody projection.

## Remaining workflow

Next, persist a statement revision bound to a versioned agency destination, exact source digest and independent platform review. Recheck authority and the original source under the booking lock for every decision, including retries. Approval cannot record payment. Execution needs separately protected transfer evidence; independent agency receipt confirmation must release only the exact original allocation sources. Fee shortfalls need their own independently reviewed agency funding evidence. Later refunds require original-payment budgets and accepted source-specific credit/recovery dispositions, without rewriting past transfers or crediting all held owner funds.

Provider refund approval, durable reservation/dispatch/ambiguity recovery, verified observation posting, additional-balance collections, custody/fee disclosures, customer hosted checkout/status return and whole-system provider acceptance remain open. No provider refund, transfer or new payment was sent during this checkpoint. Payment activation and general email dispatch remain off; no new migration is applied.

## Provider references and conservative application rules

PayMongo documents refund resources with pending, processing, succeeded and failed statuses, opaque metadata, PHP centavo amounts and the original payment ID: [Refund resource](https://docs.paymongo.com/reference/refund-resource). Its guide permits partial refunds within the original payment balance and describes restrictions by payment method: [Refunds guide](https://docs.paymongo.com/docs/payment-acceptance-refunds). The current guide gives a V1 refunds API example; the read adapter follows that API version. This checkpoint has no actual provider-issued refund resource to accept against the sandbox. The response contract is verified with synthetic transport fixtures, not represented as actual provider refund acceptance.

The application’s reservation, terminal-conflict and source-digest rules are conservative integration rules derived for Rent2Go; they do not assume the provider will resolve an ambiguous request automatically. The minimum refund amount and integer upper bound follow the documented refund resource; unsupported small amounts are not rounded or discarded. Method/window eligibility and actual available provider balance must be checked before any future dispatch.

## Checkpoint verification

566 full unit/interface cases pass, plus27 final focused cases. Ten native custody cases pass, including actual restricted-runtime reads, withheld owner payouts, exact-source statement/digest conservation and fee-shortfall withholding. These native cases use synthetic provider transport and explicitly constructed accepted accounting fixtures; they do not claim a new real provider payment or a complete provider-refund/disbursement walkthrough. The initial build caught an overly narrow UUID type inferred in a duplicate-identity test; its fixture type was corrected, followed by a passing build and sequential TypeScript check.

Four-role primary custody16 and service-health14 HTTP checks pass. The baseline’s98 protected history tables and two contact plans are unchanged. The reservation-expiry worker is running; payment processing and general email dispatch remain off. No migration or external financial/communication request was issued. The earlier notification/dashboard checkpoint retains its own12 native and48 HTTP evidence plus responsive visual checks.
