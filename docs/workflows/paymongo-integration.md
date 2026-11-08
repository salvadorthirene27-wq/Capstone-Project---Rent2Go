# PayMongo integration — in progress

This is an expansion after acceptance of the earlier local system. It is not yet wired into booking collections, refunds or disbursement accounting. Existing payment histories remain intact while the replacement is built; the provider flag stays disabled until the full path is verified.

## Approved financial direction

The user approved central collection through Rent2Go's PayMongo account. Amounts owed to each agency must be recorded separately; a PayMongo checkout receipt does not prove an agency disbursement. Processing fees are an agency expense. The renter's accepted amount and the agreed Cosigner, agency, platform and maintenance percentages remain unchanged. Refundable deposits remain outside revenue. Provider test transactions must retain their no-money identity.

The user also approved holding refundable deposits centrally until an approved refund, and releasing the combined owner/agency/maintenance allocation only after financial closing. Fees reduce only the agency's own portion. If fees exceed that portion, the shortfall remains an agency obligation; owner and maintenance allocations must not fund it. Existing disbursements remain immutable when later credits/refunds arise and require separate reviewed adjustments.

Central custody changes the previous agency-receipt model. The next implementation must distinguish centrally held funds from cash/manual agency collections, prevent charging an agency a second platform remittance for commission already held by Rent2Go, record actual provider fees without reducing protected owner/maintenance shares, and preserve exact separately reviewed agency disbursement records. Provider refunds and additional-balance collections must reconcile with their original source rather than silently use an old simulation.

## Provider foundation

The server connector creates V2 hosted checkout sessions, retrieves/explicitly expires V1 resources, uses persistent caller-supplied idempotency keys and never automatically creates a replacement after an ambiguous network result. PayMongo's idempotency window is 24 hours; the durable booking integration must stop unresolved creation retries before that window closes and require reconciliation rather than reuse an expired key.

The actual test API was exercised with a synthetic PHP100 checkout: creation, retrieval and expiry passed; no payment was made and no application financial record changed. V2 creation returned only the resource ID, checkout URL, mode and timestamps. The connector validates that minimal result separately. The caller must persist it before requesting the complete session, so a failed retrieval cannot lose the provider mapping or create a second payable checkout.

Foundation verification: all 442 unit/interface/route cases pass, including 17 provider-specific cases for credential/environment gates, exact hosted origins, payload privacy, minimal creation responses, pending-versus-paid evidence, conserved provider fees, signature tampering/replay/mode boundaries, bounded responses and ambiguous network errors. Production build and TypeScript checks pass. These checks establish the provider foundation, not completion of the booking/financial integration listed below.

The hosted address must be HTTPS on checkout.paymongo.com. Server-only secret credentials stay outside the repository. Return paths come from the configured app origin; redirect parameters do not confirm payment. Provider billing data/error bodies are neither returned to the application nor copied into logs. Requests send an opaque internal reference and generic booking balance, without renter contacts, documents or service itinerary. Automatic provider email receipts and pass-on fees are disabled.

Verified full sessions enforce PHP, matching test/live mode, exact integer gross totals, at most one paid payment and fee/net conservation. Pending and failed attempts do not become collections. Signed notifications verify the raw body using HMAC-SHA256, mode-specific signature and a five-minute tolerance against PostgreSQL time. Missing signing secrets fail closed. Unrelated events cannot become paid checkouts.

For a local-only installation, authenticated server retrieval/polling can reconcile provider status without exposing the laptop publicly. Webhook mode requires its actual registered HTTPS endpoint and signing secret; an invented local secret is not a substitute. Checkout sessions do not expire automatically at PayMongo, so local booking expiry/cancellation must explicitly reconcile and expire provider sessions. No replacement is allowed until the original is definitively expired; paid/processing sessions require their own recorded handling.

## Remaining implementation and verification

1. Durable exact checkout preparation, provider mapping, bounded retry/reconciliation and request-scoped access. Bind quote/agreement/agency/mode/amount; serialize overlapping payment and cancellation/expiry commands.
2. Provider-confirmed collection posting and local status worker, with late receipts retained as liabilities without reclaiming released stock. Keep historical demo/manual records immutable.
3. Replace new online payment controls with hosted checkout and status/return feedback. Supported methods come from configured PayMongo capabilities and approved agency policies; do not advertise PayPal as a PayMongo option.
4. Central custody, agency fees/payables/disbursement records, provider-backed refunds/additional balances and remittance/report/notification projections. Do not double-count platform commission or infer a transfer from ledger allocation.
5. Native race/replay/authority/fee/refund/custody checks, actual provider test checkout/payment flow, four-role HTTP and responsive/print verification; checkpoint each completed module.

References: [Hosted Checkout](https://docs.paymongo.com/docs/payment-channels-hosted-checkout), [key concepts and expiry](https://docs.paymongo.com/docs/payment-channels-key-concepts), [idempotent requests](https://docs.paymongo.com/reference/idempotent-requests), [webhook signing](https://docs.paymongo.com/docs/developer-tools-webhook-setup-management), and [Checkout Session resource](https://docs.paymongo.com/reference/checkout-session-resource).
