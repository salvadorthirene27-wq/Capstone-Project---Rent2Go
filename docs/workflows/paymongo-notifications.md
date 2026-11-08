# PayMongo notifications and reconciliation queue

Signed delivery is an internal evidence path. It does not accept a quotation, confirm a booking from redirect parameters, execute a refund or prove an agency transfer. The Super Admin queue is a read-only worklist; financial dispositions remain a separate module.

## Receive and retain

`POST /api/payments/paymongo/webhook` requires explicit enabled webhook configuration, the matching signing secret, JSON and the original raw body (maximum 512 KiB). It has no browser-session or Origin requirement: authorization is the provider signature. HMAC screening happens before acquiring a database connection; final timestamp freshness is checked against PostgreSQL time with a five-minute tolerance. Test/live signatures and event mode must agree. Invalid signatures, stale deliveries and disabled configuration cannot create inbox records. Acknowledgment is returned only after committed delivery facts.

PayMongo documents the raw-body, timestamp and mode-specific HMAC contract in its [webhook setup guide](https://docs.paymongo.com/docs/developer-tools-webhook-setup-management). A local callback URL or invented signing secret does not register a provider webhook. Polling remains available for a local installation; HTTPS endpoint registration and a real provider signing secret are prerequisites for webhook activation.

Migration048 adds an immutable notification inbox, immutable alternate facts and processing results, with a separate mutable retry schedule. Each provider event is namespaced by mode and a fingerprint of the configured merchant key. Financial projection fields are validated; billing and unrelated metadata are discarded. Event/raw digests are retained rather than logging complete provider bodies. Exact semantic duplicates do not create a second payment. Conflicting delivery facts remain visible and quarantine known checkouts without overwriting original receipts or collections.

## Validate and post

The supervised payment worker processes bounded inbox batches before checkout jobs. Only a saved provider-session link in the same merchant/mode namespace can associate a delivery with a booking; claimed metadata alone cannot bind funds. Mapping can be recognized after arrival when processing has not yet completed. An already classified unmatched event remains review evidence; it is not silently reassigned later.

Validation reuses the exact lifecycle amount/currency/reference/mode/payment-identity checks. Receipt verification commits before booking posting. Pending known notifications prevent premature posting; malformed, conflicting or mismatched facts require independent review. Expired or otherwise unavailable inventory is never reclaimed because money arrived late. Unexpected processing errors back off; other checkout jobs can still proceed. Retries preserve the original records and do not collect twice. No provider request is made while receiving or validating an inbox delivery.

Transactions preserve the original error even if rollback also fails after a connection interruption. Writes are never automatically replayed, including after an ambiguous commit result.

## Review

`/admin/payments` and `GET /api/payments/reconciliation` require an active, nonfixture Super Admin. The existing workspace/sidebar is retained. Filters support case type, provider environment and an exact booking/checkout/event/case reference, with ten cases per page. Invalid filters can be cleared; unauthorized roles cannot read the queue. The API is read-only and uses no-store responses.

Each checkout is represented once in the queue, including pending validation/posting, source mismatch, late or post-close funds, and incompatible collection channels. Unmatched notifications retain their own cases. Amounts distinguish verified receipts, expected checkout totals and unverified notification claims. These individual references must not be summed as a financial balance. Renter contacts, billing, secret fingerprints, raw payloads, signatures and hosted payment URLs are not exposed in the queue. Viewing a case cannot clear it or authorize a transfer/refund.

## Checkpoint evidence and limits — 9 November 2026

All499 full unit/interface cases pass. Ten new native notification/database cases and27 existing lifecycle/posting/worker regressions pass, including restricted runtime grants, duplicates/concurrency, after-posting conflicts, late receipts, missing mappings, account namespace changes and review authorization. Provider transport and signatures in these cases are synthetic; no real payment, refund, transfer or customer email was performed. The production build and sequential TypeScript check pass. Four-role queue/callback HTTP checks pass20; existing header26/workspace19/service-health14 checks pass. Fingerprints of98 existing primary history/booking/financial tables remain unchanged.

Only the isolated database has migration048 (001–048). The application database remains001–041 plus045 and047, with online payment processing disabled. The actual desktop1440/phone375 screen check covers its honest records-unavailable state, filters, sidebar/menu return navigation and overflow; populated cases are covered by native database and interface tests, not claimed as a populated-primary browser walkthrough. General email dispatch remains disabled.

Next: durable central custody, protected shares/agency fee obligations, reviewed financial dispositions, actual agency disbursement records, provider refunds and additional balances, customer hosted checkout/status feedback, then complete provider and full-role acceptance before enabling the replacement.
