# Booking payment implementation plan

> For agentic workers: use superpowers:subagent-driven-development with the fixed shared payment contract and independent source review after integration.

Goal: record reviewed agency collections and distinctly labeled demo transactions against exact signed agreements, preserve liabilities and commit inventory safely before fulfillment.

Architecture: immutable PostgreSQL attempts, decisions, collections and hold commitments; existing participant locks, private storage, strict route validation and client server-clock feedback. No real gateway or additional dependency. Fixed engineering contract is work/booking-payment-brief.md outside the public repository; approved design sections8–10 and refined manuscript workflow govern.

Constraints: multi-agency; no GPS; manual/demo never mix; integer centavos; services/deposits/overpayment separate; full quoted amount gates readiness, partial collections never silently expire; expired receipts need reconciliation without reclaiming inventory. No earnings/provider settlement is created in this slice.

Review focus: duplicate retries/references, suspension while storage/locks wait, late manual review after expiry, partial commitment across the original deadline, immutable saved payment destinations rather than mutable current policy.

- [x] Backend: migration018, schema/service/routes/private evidence, narrow commitment projection and expiry/reissue guards. Observe domain/route RED/GREEN and isolated DB invariants.
- [x] Interface: owner GCash/demo and operator cash/review workflows, fixed capability-driven controls, private evidence/history/receipt links, current totals and reconciliation states. Observe meaningful interface RED/GREEN.
- [x] Parent integration: isolated migration/grants, protected printable receipt, paid/committed status copy and queues, build/full unit and focused workflow database regressions, actual production HTTP/S3 checks.
- [x] Resolve independent review, update evidence/status, database/source checkpoint/bundle, push and verify GitHub. Continue fulfillment and cancellation/refund modules afterward.
