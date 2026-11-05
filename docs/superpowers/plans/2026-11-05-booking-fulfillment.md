# Rental and tour fulfillment implementation plan

Goal: progress each funded service through documented delivery and return/completion while preserving physical resource availability and separate financial reconciliation.

Authority: approved manuscript pages31–34 and existing design section7; engineering contract in private work/booking-fulfillment-brief.md. Preserve multi-agency permissions, PG time, immutable evidence, manual/demo labels and no GPS. Follow established interface and privacy patterns without dependency upgrades.

- [x] Add immutable inspection/photo/acknowledgement/action records and close-once actual resource occupancy; guarded migrations019–020 and runtime grants, isolated first.
- [x] Implement exact per-line lifecycle and gates, actor/member rechecks, idempotency, photo pre/post authorization and protected reads. Real restricted-role database and domain checks pass.
- [x] Integrate overdue/actual return buffer and unsafe-return holds with search, quote resource locking, driver choices, manual blocks and resource availability. Maintenance can record repairs while sales remain safety-blocked.
- [x] Add renter/operator inspection and tour controls in both details, mixed progress, server-time/stale/busy/error handling, private image access and persistent demo identity. Production HTTP exercises actual commands. Exact protected historical inspection pages preserve disputes and printable records.
- [x] Run focused and regression checks/build, production HTTP/S3 walkthrough and bounded inline source review; document unresolved limits. Save source/database checkpoint and push before cancellation/refund/reconciliation.

Evidence:188 unit/interface checks;9-case fulfillment run plus focused2-case regression (10 distinct cases),47 existing database cases,74 live HTTP/S3 checks and5 final-build historical-report HTTP checks. The resource update race was observed failing then passing. No separate agent review was performed this turn. Authenticated browser layout/OS print verification remains open because Edge could not launch in the sandbox. Managed branch and private application export are saved; full Auth/object-storage restoration remains untested.
