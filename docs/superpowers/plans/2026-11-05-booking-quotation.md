# Booking approval and quotation implementation plan

> For agentic workers: use superpowers:subagent-driven-development. The approved manuscript workflow and saved unified design govern this module.

Goal: approve reviewed requests by holding all inventory atomically, issue a dated quotation and record the renter's exact-version response before the agreement stage.

Architecture: preserve request snapshots and immutable quote versions in PostgreSQL. Resource exclusions and locked tour capacities enforce allocation; an expiring hold links all claims and a local worker releases expired holds. Current Next.js, managed Auth, private storage and pg transactions remain in use.

Spec: approved refined manuscript body, PRODUCT.md and the local shared implementation contract (private paths stay outside public version control). Rental service revenue includes the driver fee when applying agreed shares; deposits stay separate, as confirmed by the user.

Global constraints: no approval before requirements accepted; no self-review or cross-agency access; no partial mixed-request allocation; no overwritten quote history; no money/earnings before later workflows; no GPS.

- [ ] Backend: migration015, quotation/allocation/expiry service, strict action schema, API and local worker. Observe focused failing tests, then implement and pass domain/isolated database cases for capacity, conflicts, atomic rollback, expiry/releases, exact acceptance and permissions.
- [ ] UI: requestId-driven quotation panel in both detail pages, eligible driver selection, agency approval/rejection, separated totals/policies/expiry, explicit renter acceptance/decline, read-only outcomes and stale recovery. Observe focused failing test then pass interface regressions.
- [ ] Integration: repeatable runtime grants, queue labels/lifecycle copy, isolated migration then demo migration after snapshot, production HTTP checks, worker operation and visual checks where available.
- [ ] Review/checkpoint: resolve independent review findings; run appropriate full checks, scan staged secrets, commit, save source bundle/database snapshot and push feature/main with remote SHA verification. Continue agreement implementation after this checkpoint.
