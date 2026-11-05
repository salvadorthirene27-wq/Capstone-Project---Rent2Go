# Pre-service cancellation

Authority: approved manuscript pages31,34,55 and design sections7/9. Scope is one agency's complete request. A cancellation request does not release inventory or claim a refund. No cancellation percentage, tax, penalty or refund formula is inferred.

- [x] Immutable cancellation requests preserve reason and exact public service/policy snapshot; immutable withdrawal/rejection/approval decisions and exact idempotency keys retain history. Only the renter requests/withdraws; an independent active agency operator reviews the exact request/digest with a reason.
- [x] Request/decision gates prohibit the standard cancellation path after any actual vehicle handover or tour start, including subsequently returned/completed services. Pending review pauses material booking progression, while unpaid holds retain their existing expiry. Rejection/withdrawal leaves the actual current lifecycle stage intact.
- [x] Approval locks the request, authority, hold, ordered resources and departures and releases remaining allocations exactly once, including committed stock. Confirmed/pending manual collections produce a cancellation reconciliation state. No collection, deposit, refund, paid status or earnings is rewritten.
- [x] Integrate scoped renter/operator controls, preserved policy/history, stale/busy/network retry handling, clear manual/demo labels and cancelled queues. Preserve later manual receipt review as a reconciliation liability.
- [x] Verify domain/route/interface, isolated database including concurrency/restricted runtime and regression checks, production HTTP, build and checkpoint/push. Continue reviewed refund/deposit reconciliation afterward.

Observed evidence:196 unit/interface/route checks, full59-case six-module database regression, focused actual-runtime private-tour/driver release, production build/TypeScript and36 live HTTP checks pass. Manual Neon snapshot and private schema021 application export saved; source checkpoint/push follows verification. Browser layout and full Auth/object-storage restore remain open; no refund or real funds moved.
