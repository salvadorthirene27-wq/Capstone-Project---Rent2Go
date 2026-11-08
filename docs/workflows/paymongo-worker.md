# Supervised PayMongo status processing

This internal module connects the durable checkout lifecycle to verified-receipt posting. It does not activate customer checkout, release agency funds, execute refunds or prove production readiness.

## Gates and target

`npm run payment:process` uses an explicit worker opt-in plus the independent PAYMONGO_ENABLED gate. Live mode also requires PAYMONGO_LIVE_ENABLED. The launcher validates the designated project/endpoint, application database and restricted runtime role; `--test` selects only the isolated database. It requires migration046 before claiming the named PAYMONGO_CHECKOUT_SYNC worker. Neither starting the website nor opening Service health starts a worker. Keep PAYMONGO_WORKER_ENABLED and provider activation disabled until the complete financial workflow has been validated.

Migration046 widens the existing supervised-worker name constraint and indexes due checkout state. It is applied only to the isolated test database at this checkpoint; the application remains001–041 plus045. The existing hold-expiry worker APIs retain their contract. A coordination-row lock fences overlapping worker processes; the existing per-checkout lease and atomic booking posting protect concurrent consumers. The script releases its lease on shutdown, supports --once, and stops when ownership is lost.

## Processing and recovery

Each bounded batch selects due jobs for the configured payment mode and merchant-key fingerprint. It prioritizes verified receipts that have no posting, respects checkout leases and cooldowns, and skips terminal unpaid or independently quarantined work. Lifecycle processing persists the provider mapping before retrieval and commits verified payment facts before the separate posting step. A crash between verification and posting is recovered without a second creation or duplicate collection. Counts refer to inspected jobs, not successful payments. Partial failures preserve committed receipts and back off failed work; batch history records sanitized error categories rather than provider bodies or customer data.

Provider network ambiguity remains pending and cannot create a replacement payable checkout. Source expiry/cancellation continues using the existing verified expiry path, not the local booking deadline alone. PayMongo states that sessions stay active until explicitly expired and that a processing payment can prevent expiry; see [Key concepts](https://docs.paymongo.com/docs/payment-channels-key-concepts). Old-key or other-mode sessions are not dispatched by the current worker. Their saved references/receipts remain for an explicit independent reconciliation workflow; key rotation must not silently discard those obligations or reuse an uncertain creation key.

Service health reports payment-worker enablement, configuration/schema readiness, recent contact and successful batch time to authorized Super Admins. Those observations do not certify individual collection, refund or disbursement outcomes. No secret, merchant fingerprint, instance identifier, billing field or raw exception is exposed in the overview. Signed-notification ingestion and the reviewed exception queue remain subsequent modules.

## Validation

Six native worker cases cover exactly-once receipt posting, recovery after verification before posting, ambiguous creation/cooldown, foreign-key/disabled boundaries, concurrent worker ownership with sanitized run history, and restricted-role supervision. Six unit target cases cover worker/provider opt-in, isolated target selection, wrong project/database/user/endpoint and live gating. Existing expiry-worker and gateway lifecycle/posting regressions, full unit checks, build, sequential type checking and four-role HTTP health checks supplement these cases. No actual provider checkout/payment/refund/disbursement or email was dispatched by this module’s checks.
