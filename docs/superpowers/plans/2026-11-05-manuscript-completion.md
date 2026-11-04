# Approved manuscript implementation sequence

User resumed development on 5 November 2026 and explicitly authorized module checkpoints and GitHub pushes. Authoritative manuscript is the approved 82-page RENT2GO_REFINED_MANUSCRIPT.pdf, SHA256 3c6e8265f0b5ba96b54c92f6e654e3abd488a057ada98339f9a2843867521236. Source PDF and private extracts stay outside public version control. The first 11 preserved preliminary pages contain superseded text; revised body workflows and user corrections govern implementation.

1. Home: retain Marc Albert develop landing UI, wire actions/navigation/current auth; preserve source asset provenance; verify and checkpoint.
2. Booking requirements: request-linked private identity/license uploads, immutable versions, human review with reasons and correction/resubmission; OCR advisory/manual fallback; no approval before requirements accepted. Verify owner and agency denial paths.
3. Allocation and quotation: atomic vehicle/driver/group-seat/private-slot claims, conflict rechecks, expiring holds, immutable quotation versions, explicit driver compensation, acceptance and rejection paths.
4. Agreement: exact accepted quote/policy digest, electronic agreement and signature evidence, authorization and stale revision protection.
5. Payment: reviewed manual evidence/cash and labeled card/GCash/PayPal simulation; idempotent events; no demo/actual mixing or real payment credentials.
6. Fulfillment: pre-inspection/release/active/return/reconciliation for rentals; attendance/start/completion for tour-only services.
7. Cancellation/refund: pre-service policy gates, released claims, independent refundable amounts, deposit disposition and payout evidence.
8. Finance: reconciled revenue basis; agreed 70/10/10/10 consignment, 80/10/10 agency-owned, 90/10 tour defaults; separate deposits/reserves; adjustments, withdrawal reservation, review and actual payout record.
9. Reporting/governance: agency/owner/platform scopes, notifications/outbox, privacy/retention/account controls, exports and accessible reporting; vouchers optional rubric enhancement.
10. Defense verification: full role workflows with synthetic demo accounts, concurrent/foreign-record cases, local demo guide, backup/restore exercise. Human usability findings require actual participant evidence.

Each module receives appropriate domain/database/HTTP/interface checks, a source checkpoint, restore bundle, GitHub push verification, and updated status. Database snapshots accompany schema changes. Do not declare overall completion while any required stage or verification remains open. GPS/geofencing, public deployment, live money movement, social login and standalone realtime chat remain outside the approved scope.
