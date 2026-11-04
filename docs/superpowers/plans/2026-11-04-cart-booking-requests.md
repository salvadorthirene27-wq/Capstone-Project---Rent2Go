# Persistent Cart and Booking Requests Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. This implements the already approved design; user authorization to continue covers these workflows. Complete the catalog checkpoint before changing booking source.

**Goal:** Let a signed-in renter collect date-specific rental/tour services and submit distinct, auditable requests to their agencies without treating a cart or request as a reservation.

**Architecture:** Extend the existing Next.js domain services and new Neon database. Persist actor-owned carts, immutable request snapshots and events. Reuse server-side published eligibility and pricing; later approval will claim the existing resource occupations and tour schedule capacities transactionally.

**Tech Stack:** Existing TypeScript, Next.js16, pg, Zod, managed Neon Auth, private S3 and Vitest. Additive migrations011 onward with explicit runtime grants. No old environment/source/database.

**Spec:** `docs/superpowers/specs/2026-11-04-rent2go-design.md` sections5–9,13–14; `docs/rubric-alignment.md`; `PRODUCT.md`; `DESIGN.md`. Catalog plan Task5 is the dependency.

## Global constraints

- Multiagency, no VSME pilot, no GPS/geofencing. Static pickup/meeting addresses only.
- Local demonstration; no live gateway or actual charges. No private files or credentials in public projections or Git.
- Renter-supplied prices, agency IDs, allocations and listing revisions are never trusted as financial truth.
- Rental dates use UTC instants and half-open intervals, entered/displayed in Manila. Vehicle post-return turnaround must agree with the later allocation service.
- Vehicle seats include the driver. A supplied agency driver consumes a seat outside the renter party.
- Driver fee units are agency-chosen and explicitly snapshotted: once per booking, per24 hours, per Manila calendar day, per hour or per vehicle billing unit. Missing legacy units are not guessed.
- GROUP tour prices multiply by guests; PRIVATE prices apply once to the whole party. A private slot permits one party within its capacity.
- Tour-only operator transport does not create a customer rental or inspection gate. An explicit rental line in a mixed service request retains rental gates.
- Cart and submitted requests do not reserve inventory. Approval, documents, accepted quote and exact agreement precede payment and handover.
- Deposits remain separate from service revenue. No earnings, payout or maintenance ledger posting occurs merely from checkout.

## Review focus

1. A stale cart must not silently submit a changed price or changed service terms; the renter must review a refreshed estimate.
2. A renter must not read or mutate another actor's cart, request, contact details or document references by changing IDs.
3. Retrying checkout must not create duplicate requests, even when the first response is lost.
4. A mixed-agency basket must not create one cross-tenant request or allow partial hidden checkout if one selected line is invalid.
5. A cart must never appear reserved or paid; no client command can forge availability claims, acceptance or agency approval.

## Task1: Persistent cart and server-owned estimates

- [x] Write RED tests for owner isolation; anonymous denial; invalid dates/party; unavailable or withdrawn services; explicit fee units; group/private arithmetic; deposit separation; duplicate add; stale update; malicious price/agency overrides.
- [x] Add `booking_cart` (one active cart per actor, optimistic version) and `cart_item` (kind, validated selection, source fingerprint, saved server estimate/revision, version). Keep identities stable and bound the basket to20 services with a visible limit.
- [x] Add `src/modules/cart/schema.ts`, `service.ts`, `pricing.ts` and `src/app/api/cart/*`. Serialize add/update operations on the cart row. Source fingerprints prevent duplicate clicks from silently adding a second identical car/slot.
- [x] For vehicle lines, validate exact offer/mode/date/party and derive effective agency and current published agreement. For tours, select an actual published schedule; validate its current revision, cutoff, capacity, party limits and pricing model.
- [x] Reuse rental pricing and tour arithmetic. A cart read reports current eligibility and whether saved prices/terms changed; changing snapshots requires an explicit renter review/update, not silent acceptance.
- [x] Add real add-to-cart controls to detail pages, cart count/navigation, grouped agency sections, update/remove and subtotal feedback. No fake reservation timer or payment control.
- [x] Verify with unit/live DB/runtime API checks and desktop/mobile review where browser access permits. Commit the independently working cart. Evidence:56 unit/UI,66 full DB,7 final cart DB,35 live cart HTTP and68 demo-fixture checks; build/type pass. Current desktop/mobile visual walkthrough remains explicitly pending because the available Windows Chrome session does not expose the user's in-app preview.

## Task2: Idempotent grouped request checkout

- [ ] Write RED tests for all five review-focus conditions, price-change conflicts, unavailable selections, empty checkout, duplicate idempotency keys with different bodies, agency-owned actor self-review and no claim creation.
- [ ] Add `booking_request`, immutable `booking_request_line`, `booking_event` and actor-scoped checkout idempotency records. Each request belongs to exactly one agency and renter. Store publication/policy/price/unit/financial-category snapshots and separate refundable deposits.
- [ ] Implement one transaction that locks the actor's cart, validates selected versions and all current selections, and creates one request per agency. If any line is invalid, create no requests and retain the cart for correction.
- [ ] Persist a deterministic command hash and result under the idempotency key. Same command returns the same request IDs; a different command with that key returns409.
- [ ] Capture renter contact/party details privately, distinguish booking guest count from vehicle inventory quantity, record immutable submission events and in-app notifications.
- [ ] Clear submitted cart lines only on success. Receipt/confirmation states say request submitted and requirements pending; no reservation, approval, payment or invoice is fabricated.
- [ ] Add `/checkout`, `/workspace/bookings` and renter request detail, plus scoped agency queue/detail. Only the renter and that agency's authorized operators see contact/service snapshots. Super Admin governance access is explicit and does not grant self-approval.
- [ ] Run full relevant checks and direct foreign-ID API attacks, then commit/push a verified checkpoint.

## Task3: Private requirements and human review

- [ ] Write RED tests for current versus replaced evidence, missing/expired driving requirements, corrections/resubmission, unauthorized document reads, stale decisions and self-review.
- [ ] Define per-service document requirements from approved agency policy plus structured rental gates. Self-drive requires driver eligibility; tour-only must not require rental release/return documents automatically.
- [ ] Add private requirement versions/files and immutable per-file decisions, reusing validated S3 uploads and audit. A replaced or expired file never inherits approval.
- [ ] Add optional local OCR assistance only after verifying its actual runtime; extraction is advisory and never proves authenticity or approves identity. Retain a complete manual review path and private access.
- [ ] Expose reasons/correction actions to renter and reviewer, then test real upload/download byte equality and role walkthroughs. Actual human/OTP/usability evidence remains separate.

## Task4: Approval and holds before quote/payment

- [ ] Write RED concurrency tests: same car/driver interval, group oversell, exclusive slot races, multiple resources with opposite request order, duplicate approval, expiry release once, suspended/unpublished services and stale requirement approvals.
- [ ] Read the current agency policy and listing revisions again; reject unresolved price/policy changes. Require accepted current requirements and an independent authorized agency operator.
- [ ] Establish a documented global lock order across request, agency, physical resources and schedules. Lock multiple resources in stable ID order and recheck the active actor under those locks.
- [ ] Claim vehicle/driver intervals including the approved buffer in `resource_occupation`; update tour reserved units under row lock. All lines allocate or none allocate. Private uses one party unit; group uses guest count. Preserve the assigned schedule revision.
- [ ] Attach the configured quote/hold deadline. Expiry is transactional on relevant access and through a local background worker; it releases unfulfilled holds exactly once. A confirmed paid/ready booking must not expire as an unpaid quote.
- [ ] Reject destructive edits/cancellations of allocated departures. Existing paid obligations retain their accepted snapshots; catalogue withdrawal only blocks new requests.
- [ ] Commit after full state/concurrency/API verification. The subsequent quotation/agreement/payment and fulfillment/accounting plan must consume these invariants.

## Subsequent dependencies

Versioned itemized quotes → renter acceptance → exact agreement/signature → manual cash/GCash or explicitly labeled demo transaction → release/attendance/start → return inspections or tour completion → separate cancellation/refund/deposit reconciliation → immutable earnings/maintenance allocations and approved payouts → reports/governance/vouchers/backup restoration and full defense walkthroughs.

Before financial posting, clarify how driver fees are allocated or treated as pass-through driver compensation. The current pricing choice defines the charge unit, not a driver's payout agreement. Do not invent that remaining financial rule.

Keep tested checkpoints and local continuation notes. Do not claim the whole system complete from the catalog/cart/request slices alone.
