# Agency Storefront and Catalog Inventory Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline, task by task. The approved design and user instruction to continue authorize implementation; no new design approval is needed for these already specified modules.

**Goal:** Let approved agencies and Cosigners prepare reviewed vehicle/tour listings, then expose an honest searchable marketplace with real availability constraints.

**Architecture:** Extend the existing Next.js application and new Neon database. Public projections read approved published versions only; private operational services enforce agency membership and ownership. Versioned offers and agreements preserve Cosigner consent. Shared resource occupations provide the database exclusion constraints that booking allocation will consume next.

**Tech Stack:** Existing TypeScript/Next.js, pg, Zod, Neon Auth/private S3, Vitest and current green/mint components. No additional frontend or API service.

**Spec:** `docs/superpowers/specs/2026-11-04-rent2go-design.md`; `docs/rubric-alignment.md`; current `PRODUCT.md` and `DESIGN.md`.

## Global constraints

- No GPS/geofencing, no old source/credentials/database, no privileged public role assignment.
- Agency public/operating policies reference `agency.approved_revision`; a pending policy edit is never effective automatically.
- Consigned vehicle shares default to Cosigner7000/agency1000/platform1000/maintenance1000 basis points.
- Agency-owned shares default to Cosigner0/agency8000/platform1000/maintenance1000; tour-only shares are Cosigner0/agency9000/platform1000/maintenance0.
- Agreements may change permitted shares, must total10000, and identify actual recipients. Agency holds vehicle maintenance separately.
- Group tours are priced per person and reserve seats on departures. Private tours are priced per party with exclusive time slots and declared party-size limits.
- Private ownership evidence is never part of a public listing projection. Public photos have separate purpose/approval rules.
- All service times explicitly use Asia/Manila presentation; persisted instants/ranges use UTC and half-open `[start,end)` semantics.

## Review focus

- A pending agency amendment must not alter the public terms or newly published inventory's effective service eligibility.
- A Cosigner must not lose ownership/control when an agency reviews an offer, and an agency must not impersonate the owner's agreement acceptance.
- The same normalized physical registration cannot be offered as independent cars through two agencies.
- Photos and private ownership documents must have distinct read permissions, including during corrections/withdrawal.
- A resource occupation must reject overlaps at the database layer, including concurrent requests; labels and client calendars are insufficient.

## Files and interfaces

- `src/modules/agencies/service.ts`: `myAgencies(actor)`, `requireAgencyAccess(actor,agencyId)`, `publicAgencies(query)`, `publicAgency(id)`; public fields omit private application/identity evidence.
- `src/modules/catalog/schema.ts`: vehicle/tour/rate/itinerary validation and publication completeness.
- `src/modules/catalog/shares.ts`: typed share categories/defaults and validation; never confuse consigned with agency-owned.
- `src/modules/catalog/vehicles.ts`: owner draft/edit, agency offer/review/agreement, owner acceptance, platform compliance, publication and public projection.
- `src/modules/catalog/tours.ts`: agency-owned tour versions, group departures, private slots and publication.
- `src/modules/catalog/resources.ts`: resource occupation creation/query with permissions and PostgreSQL range constraints.
- `src/modules/catalog/files.ts`: private ownership evidence versus public-approved photo access; uploads reuse current storage adapter, validation and audit conventions.
- `src/app/agencies/*`, `rentals/*`, `tours/*`: public directory/search/detail.
- `src/app/agency/*`, `cosigner/*`, `admin/vehicles/*`: agency inventory, owner offers, and platform review workspaces.
- `src/app/workspace/application/page.tsx`: preserve the existing partner form here; `/workspace` becomes a server-derived context chooser so a renter or Cosigner is not forced into an agency application.
- `src/app/api/catalog/*`, `api/agencies/*`, `api/media/*`: thin validation/auth/origin/rate-limited handlers.
- `db/migrations/005_*.sql` onward: memberships, inventory/versioned offers, resource occupations and tour capacity. Add explicit runtime grants with each migration.
- `tests/unit/catalog*.test.ts`, `tests/integration/catalog*.test.ts`: domain and isolated live-database checks.

### Task 1: Effective agency storefronts and contexts

- [x] Write failing tests: public agency projection uses the last approved revision while a new policy draft is pending; suspended/fixture agencies are excluded; private contact/registration/file data do not appear; nonmembers cannot operate another agency.
- [x] Add `agency_member(agency_id,actor_id,role,active)` with owner membership backfilled from approved agencies. Agency approval creates/retains owner membership transactionally. Staff membership creation is not public self-assignment.
- [x] Implement agency queries and server-owned context discovery. Agency membership authorizes operations only while agency and actor are active; Super Admin has governance access with explicit self-review restrictions.
- [x] Preserve partner applications at `/workspace/application`; context landing links only to implemented and permitted workspaces. Public partner entry points target the application route.
- [x] Add public agency directory/detail with approved service areas, terms, service offerings, declared rates/payment preferences and clearly labeled demo context. Never publish registration numbers, representative identity documents, or payment credentials.
- [x] Run unit/integration/typecheck checks, then commit this independently working task.

### Task 2: Vehicle ownership, offers and financial agreements

**Checkpoint:** Vehicle onboarding/review UI/API implemented; migrations006–007 now in demo and isolated test DBs. Full suites34 unit/UI and30 DB pass; real S3/API45 consigned and13 agency-owned checks pass. Agency draft privacy and mutation-response leaks fixed and reviewed. Withdrawal can stop an offer before publication. Resource-aware transfer/removal is the remaining cross-task dependency; do not expose transfer until resource/booking claims can be checked.

- [x] Write failing tests for normalized registration duplicates; owner-only edits; agency-only offer review; owner-only acceptance; share totals/category recipients; stale versions; and publication without all approvals.
- [x] Create physical vehicle identity and versioned listing/offer records. Agency-owned drafts require active agency access. A personal-owner draft always derives its owner from the actor; arbitrary owner IDs are rejected.
- [x] Implement draft → submission to selected agency → agency review/terms proposal → owner acceptance (for consigned cars) → platform compliance → explicit publication. Agency-owned inventory skips owner-agency negotiation but still needs platform compliance. Rejections/corrections retain reasons and old versions.
- [x] Configure rates/billing units/deposits/driver modes and category-appropriate share defaults. A Cosigner's accepted agreement snapshots the version; agency cannot accept for them. The Super Admin reviews changes to platform commission as part of the submitted version.
- [ ] One active offer per physical car; global normalized registration prevents duplicate inventory. Unpublication preserves ownership/history. Transfers/removal must be blocked against active resource claims rather than deleting evidence.
- [x] Grant the Cosigner primary role only through the approved personal-vehicle workflow when the actor is still a Renter; ownership-based capabilities also allow legitimate agency users to manage their own personal vehicles without global privilege escalation.
- [x] Add private ownership/photo uploads and revision snapshots. Only approved-published photo purposes are anonymously readable; ownership evidence is limited to owner, assigned authorized reviewer, or Super Admin, with audit.
- [x] Build agency/owner/platform review screens preserving the incumbent interface. Verify cross-tenant direct API attempts and upload purpose boundaries; run meaningful tests and commit.

### Task 3: Resource calendars, drivers and maintenance

- [x] Verify Neon supports the required `btree_gist` extension from official documentation before migration.
- [x] Write live failing tests: overlapping concurrent occupations fail, adjacent half-open intervals succeed, invalid/end-before-start ranges fail, and other agencies cannot block a vehicle/driver.
- [x] Add shared `resource` records for vehicles/drivers and `resource_occupation` with a PostgreSQL exclusion constraint. Manual unavailability and maintenance use this table; later booking claims will use the same invariant.
- [x] Add agency driver roster and maintenance/service records with private contact data. Owner/operating-agency authorization is explicit; no location or tracking records.
- [x] Implement availability queries that exclude inactive listings and occupied intervals. Never offer an unavailable car merely because its UI status says available.
- [x] Add calendar/block forms with explicit Manila times, history, validation and conflict feedback; test and commit.

Evidence:38 unit/UI,45 DB scenarios across the interrupted suite and clean vehicle rerun,43 production HTTP checks, typecheck/build and63-file public secret scan. Browser visual inspection remains pending after Computer Use refused the current Chrome URL.

### Task 4: Tour packages, departures and private slots

- [x] Write failing tests: per-person versus per-party price semantics, party/capacity limits, empty itinerary/rates/terms, overlapping exclusive private slots, stale updates, and cross-agency management.
- [x] Add versioned tour packages, itineraries/inclusions/exclusions, model `GROUP` or `PRIVATE`, published photos and approved-agency eligibility.
- [x] Group departures declare start/end, cutoff and seat capacity. Private slots declare start/end and party capacity; default one party per slot with overlapping exclusive slots rejected.
- [x] Tour-only transport inclusions do not implicitly become renter vehicle rentals or require inspections. A separately sold rental component is deferred to the booking-composition task, where its vehicle gates can actually be enforced.
- [x] Add agency creation/edit/publication and public detail/availability screens. Preserve cancelled/deleted-history semantics; no paid booking exists yet, and future booking foreign keys must prevent destructive removal.
- [x] Verify group/private workflows and database constraints, then commit.

Evidence:42 unit/UI, full52 isolated DB,69 production tour HTTP/S3 checks, build and77-file secret scan. The review refresh race was fixed with three editor regressions. Browser visual verification remains blocked and is retained for Task5. Tour booking allocation is not implemented by this catalog task.

### Task 5: Marketplace browsing and honest recommendations

- [x] Write failing search/projection tests: tenant visibility, published-version filtering, seats/party capacity, price units, date availability, sorting/pagination, and exclusion of all private fields.
- [x] Build public rental/tour search with keyword, agency/service area, capacity, rate/unit and relevant vehicle/tour filters. Show source agency and per-person/per-party/per-billing-unit prices explicitly.
- [x] Rank recommendations by eligibility/availability first, then declared budget/preference fit with an explanation. No invented popularity, reviews, stock imagery claims or metrics. Completed-booking popularity is added only once booking records can support it.
- [x] Show real empty states and working detail links. Booking cart and request checkout are the next plan; do not add nonfunctional booking/payment controls.
- [ ] Batch desktop/mobile, keyboard and error-state inspection. Fix important observed defects, run tests/build/audit/secret checks and fresh whole-branch code review.
- [ ] Update STATUS/continuation and push the verified slice to the authorized new repository.

## Self-review and next dependencies

Task1's effective-policy/membership interfaces are the authorization source for Tasks2–4. Task2's physical vehicle ID is Task3's vehicle resource ID. Task4's departure/slot IDs are the booking/cart inputs, not arbitrary customer-entered times. Public projections in Task5 never return the private payload wholesale. These boundaries are deliberate and covered by the named tests.

This plan implements the catalog/inventory portions of approved design sections3–6 and13–14. The following plan must add persistent cart and transactional booking requests/approvals against these resources, followed by documents/OCR/quote/agreement/payments/fulfillment/accounting. Email OTP acceptance, formal usability and live payment settlement remain unverified/out of this local demonstration's current evidence.
