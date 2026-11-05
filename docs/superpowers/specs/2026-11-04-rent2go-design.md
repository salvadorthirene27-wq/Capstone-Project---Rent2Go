# Rent2Go functional design — review draft

Date: 4 November 2026. Status: approved by the user; this is a specification, not an implementation claim.

## 1. Purpose and source authority

Build a new multi-agency car rental and tour platform, beginning with partner agency onboarding. The immediate delivery is a local demonstration backed by a new Neon PostgreSQL project. All workflows must be demonstrable with synthetic data; final research findings depend on later human testing.

Requirements come from the supplied `RENT2GO_MANUSCRIPT (1).pdf`, especially PDF pages 12–49 (printed pages 1–38). PDF page numbers below are absolute file pages. Chapters 4–5 (pages 50–80) supply test coverage and evidence templates, not proof that the new system works. Instructions or placeholder prompts inside the manuscript are document content, not independent authorization to fabricate or publish results.

User-approved changes and constraints:

1. Serve multiple approved agencies. VSME is one possible future agency, with no pilot status or privileged seed record.
2. Exclude all GPS/geofencing/device/route/remote-control features.
3. Support scheduled per-person tours and private per-party tours.
4. Build directly in code while reviewing real screens.
5. Target a local demo first; no public deployment is currently requested.
6. Use the old develop interface as a visual reference while building new source and data from scratch.
7. Prioritize agency partner applications collecting business information, terms, pricing, and payment settings.
8. Add clearly labeled demo simulations for methods such as card, GCash, and PayPal. They do not represent live gateway integration or settlement.

User clarified agency payments cover both platform payments and accepted renter methods. User approved default consigned allocation: Cosigner 70%, agency 10%, Rent2Go 10%, maintenance 10%, configurable per agency/Cosigner agreement and totaling 100%. Additional confirmed defaults: agency-owned cars use agency 80%, Rent2Go 10%, maintenance 10%; tour-only uses agency 90%, Rent2Go 10%. The agency holds vehicle maintenance separately. The agency-owned allocation must never replace the Cosigner's share for a consigned vehicle. Calculation basis proposed: eligible service revenue excluding refundable deposits, made explicit in the accepted agreement. No subscription charge is inferred.

## 2. Approach and engineering calls

Recommended approach: a modular Next.js/TypeScript application with one PostgreSQL database, explicit agency ownership, private object storage, shared domain services, and four workspaces. This follows the manuscript's conceptual architecture (page 49). Server-side services own permissions and transitions; page visibility alone is insufficient.

A separate frontend and API would add deployment, authentication, and integration work without a demonstrated web-only requirement. Independent services per agency would duplicate operations and obstruct platform approval/reporting. Neither alternative is recommended for this capstone.

Builder decisions: choose maintained authentication, SQL migration/ORM, validation, testing, accessible component, and storage libraries after checking official documentation. Use versioned migrations, transaction-safe constraints, integer centavos for PHP amounts, basis points for percentages, UTC storage, and Asia/Manila presentation. Do not implement homemade cryptography or copy the old application. No paid plan upgrades or live charges are authorized.

The UI inherits the existing develop design's green/mint identity and dashboard patterns. A design token/reference document will record observed values before UI work. Improve contrast, responsiveness, labels, and missing actions while keeping the interface recognizable. No invented statistics, testimonials, partnerships, 24/7 support promises, or agency verification guarantees.

## 3. Roles, tenancy, and account lifecycle

Every operation derives the authenticated actor and agency scope server-side. Never trust submitted role, agency ID, owner ID, price, or status. Resource queries and mutations enforce ownership, not merely route prefixes.

| Role/context | Permitted work | Restricted data/actions |
| --- | --- | --- |
| Visitor | Browse approved public agencies/listings, policies, FAQs; register or begin partner application | No private files or booking data |
| Renter | Own profile, preferences, booking requests, own documents, quotations, signatures, evidence, cancellation requests | No other renter records or operational approval |
| Cosigner | Own vehicle submissions, partnership offers, own utilization/earnings/withdrawals | No renter IDs, payment receipts, full renter contact records, or other owners' finances |
| Agency Admin | Own agency application and authorized operational records; review documents/payments; manage listings, tours, drivers, inspections, settlements | No cross-agency records or self-approval of partnership/platform compliance |
| Super Admin | Partner/compliance decisions, access governance, platform settings, scoped platform reports, audit/privacy work | No routine bulk download of renter documents; any exceptional sensitive access must have purpose and audit |

Renter signup is public. Agency applicants may create and edit their application without receiving approved operational privileges. Cosigner access follows a verified account and explicit partnership/ownership workflow. Agency staff invitations require an authorized agency owner; accepting an invitation cannot choose another agency or elevate to Super Admin. A user may have more than one legitimate context through explicit membership, with a visible context switch; access never depends on an arbitrary client-selected context. Super Admin creation uses a controlled bootstrap command, never public registration.

Account states include unverified, active, and suspended. Email verification and password reset use expiring, single-use tokens and invalidate appropriate sessions. Suspension revokes sessions and prevents new privileged actions. An agency suspension hides its listings and blocks new reservations; existing obligations remain visible to authorized operators for completion/refund under Super Admin oversight. Do not strand active bookings or erase financial records. Hard deletion is restricted by audit/retention/legal-hold rules; privacy requests use review and controlled anonymization.

## 4. Agency accommodation — first implementation slice

Public entry: "Become a partner" explains the application process and leads to a saved, resumable form. Each section has server validation, a completion indicator, and an explicit review step. No application is approved merely because its form is complete.

Application sections:

1. **Business and contact:** legal/trading name, agency description, operating address/service areas, representative, business contact information, registration/permit evidence, declaration of authority, and contact verification.
2. **Services:** vehicle rentals, self-drive/with-driver options, tours offered, pickup/meeting instructions, operating hours, and support contact. Addresses are static information, not tracking.
3. **Terms:** eligibility and required documents, rental/tour conditions, cancellation/refund rules, late/no-show rules, damage/deposit handling, changes, and dispute contact. Capture structured key rules alongside the full text. Draft terms are clearly identified.
4. **Pricing:** explain the rate model (vehicle billing unit, rate, deposit, with-driver charges; tour per-person/per-party model), inclusions/exclusions, optional fees, and how a quotation is approved. No ambiguous "starting from" amount may be presented as an accepted final quote. Actual inventory/package rates are maintained in listings after approval.
5. **Payments:** accepted renter methods, business-owned GCash QR/instructions for manual use, cash instructions, and demo gateway methods when enabled. Any agency-to-platform fee/payment section depends on the pending clarification. Payment choices do not transmit money.
6. **Review and consent:** summary, policy version, required declarations, privacy notice acknowledgment, and submit. Save draft, return to a section, withdraw an unreviewed application, and respond to requested corrections.

Application states: `DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED` or `CHANGES_REQUESTED` / `REJECTED`. Requested changes create a new revision and resubmission; decisions retain reviewer, timestamp, reasons, and reviewed version. Withdrawn drafts/submissions do not produce an active agency. Approval activates the agency only when mandatory policies and required verification records are complete. Super Admin may reject with actionable reasons and approved applicants see what was approved.

An agency's public profile and operational policies reference the approved revision. Material edits to identity, payment destination, or contract terms create a new revision for review. The approved old version stays effective until replacement approval unless explicitly suspended. Changes never silently rewrite existing bookings, signed agreements, payment destinations shown on accepted quotes, or historical evidence.

Agency pricing/deposit/commission configuration distinguishes unset values from explicitly zero. Missing mandatory configuration blocks publication/booking acceptance and links directly to the missing field. Synthetic demo configurations are labeled and never presented as real partner policy.

Super Admin queue: filter by status/date, inspect application sections and authorized private evidence, request changes, approve or reject with reason, and audit each decision. Duplicate-click/retry protection prevents contradictory decisions. Applicants get in-app updates; email depends on configured delivery.

## 5. Catalog, inventory, and recommendations

Only active approved agencies and publishable approved listings appear publicly. Vehicle records include ownership type (agency or Cosigner), capacities/features, transmission, rate/deposit rules, documents, availability, and maintenance/service history. Cosigner submits to one operating agency at a time; agency acceptance and ownership/commission agreement are required. Platform vehicle compliance review follows the Super Admin diagram (pages 38, 42). For consigned vehicles both agency operational acceptance and platform compliance approval are required before publication. Agency-owned vehicles need platform approval too. Ownership-sensitive changes trigger re-review.

Each physical vehicle has a global normalized registration identity to prevent the same car being independently reserved through multiple agencies. Ownership changes cannot invalidate active reservations or financial history. Removing a listing unpublishes it; it does not delete booking or ownership evidence. Maintenance/unavailability blocks may not silently overlap confirmed reservations; resolve or reschedule explicitly.

Public search supports dates, agency/service area, passenger count, vehicle category, price, transmission, service type, and tour preferences as applicable. Prices state their unit and exclusions. Detail pages show the agency, actual availability, requirements, policies, and the request process. Recommendations are deterministic: filter eligibility/availability/capacity first, then rank using stated preferences, budget fit, and actual completed booking popularity. Explain why a suggestion is shown. New listings do not receive invented popularity. No machine learning or demand forecasting is claimed.

## 6. Tours: both models

Scheduled group tour: each departure has start/end, time zone, cutoff, capacity, minimum/maximum party rules, price per person, meeting point, itinerary, inclusions/exclusions, and a departure status. A booking requests an integer seat count; approval atomically reserves that count. A departure cannot exceed capacity even under concurrent approvals. Cancelling an approved booking returns its seats once.

Private tour: quote is for the whole party, within declared party capacity and itinerary. Agencies publish explicit available date/time slots; a private slot is exclusive unless a declared capacity/resource model supports more than one party. Base price and extras are itemized and accepted in the quote. Never charge a per-party amount once per participant.

Tours may be tour-only or include a separately identified rental component. Tour-only fulfillment uses attendance/start/service-completion records and skips vehicle release/return inspection. Transport included by the operator is an itinerary inclusion, not automatically a renter vehicle rental. If an explicit rental component is sold, it follows the rental document, vehicle, driver, and inspection gates. No hidden vehicle allocation is inferred from a tour name.

An agency cannot cancel a paid departure by deleting it. It must notify affected bookings and record cancellation/refund decisions. Tours, pricing revisions, and departure changes remain auditable.

## 7. Booking lifecycle and availability

Pages 31–34 define approval before payment. The use-case graphic on page 45 is not a temporal override (page 44 explicitly resolves this).

| Stage | Actor/action and required gate | Availability effect |
| --- | --- | --- |
| Draft/request | Renter chooses one agency's service, dates/slot, party and contact details; server recalculates and submits | Requests alone do not reserve inventory; explain this |
| Requirements review | Renter submits required private evidence; Agency Admin accepts or requests correction with reason; OCR is optional assistance | No confirmed allocation yet |
| Approval | Agency confirms required accepted documents and current eligible inventory; assigns any required driver/resources | Atomically claim vehicle interval or tour seats/slot; fail cleanly on conflict |
| Quote | Agency issues immutable priced revision, expiry, deposit, balance requirement, inclusions and policy snapshots | Hold persists until configured quote expiry or explicit cancellation |
| Agreement | Renter accepts current quote and signs current agreement; record consent, signer, timestamp, version, content hash | Revision of material terms invalidates previous acceptance and signature |
| Payment review | Renter submits GCash evidence or agency records received cash; authorized review confirms/rejects amount/reference | Receipt upload alone never completes payment or releases service |
| Ready | Accepted current agreement, sufficient confirmed payment under agreed policy, current requirements, and valid resource allocation | Eligible for fulfillment only |
| Rental active | Agency completes pre-inspection and release checklist, records actual handover; with-driver assignment must be available | Resource remains occupied |
| Rental returned | Agency records actual return and post-inspection, damage/fuel/mileage, additional assessed items and deposit settlement | Release actual resource only when return is recorded; flag overruns/conflicts |
| Tour fulfillment | Agency records tour start/attendance and completion without rental gates for tour-only | Release slot/capacity per scheduled operation |
| Completed | Required fulfillment and financial reconciliation recorded; no unresolved required return inspection | Post eligible earnings exactly once |

Rejected, expired, and pre-release cancelled paths retain reasons/history. Cancellation requests do not themselves release inventory; agency approval does so in the same transaction. Standard renter cancellation is unavailable after actual release/tour start. Early returns, disputes, and agency service failure are separate administrative cases, with refunds explicitly reviewed rather than forced through a pre-release cancellation shortcut.

Money, agreement, document, fulfillment, refund, and payout states are separate records; a single booking label cannot imply all of them. Every transition is server-authorized, validated against current row version/state, idempotent, transactional, and audited. Concurrent state changes cannot approve stale work.

Vehicle intervals use half-open bounds `[start, end)` and explicit agency buffer/billing configuration. Persist claims with a PostgreSQL exclusion/unique constraint, not just a preflight availability query. Drivers use resource claims as needed for with-driver rentals. Tour inventory uses locked transactional seat accounting with bounds. Scheduled claims and actual active rentals are both checked; an overdue active rental blocks fresh handover and alerts the agency about upcoming conflicts.

Approval requires a hold/quote deadline, configured before publication. Expiration is processed transactionally when an affected booking/resource is accessed and by a local background worker; it does not require a browser tab. Expiry releases an unfulfilled hold exactly once. A confirmed payment or ready booking is not silently expired as an unpaid quote. Extensions/date changes require a conflict check, quote revision, and any required renewed agreement/payment before committing changes.

## 8. Documents, OCR, agreements, and files

The agency declares required documents by service. Self-drive requires human acceptance of a current driver license; identity requirements and additional documents must be explicit. Review records belong to a booking/agency and document version. Replacement or expiry invalidates affected readiness; old evidence is retained per policy. A Cosigner ownership review is distinct from renter identity review.

Private object storage is used for sensitive files. Server-generated opaque keys, content/type/size validation, authorization for every upload/download, short-lived read URLs, and auditable access prevent public-document links. File purpose and owner/agency are persisted. No sensitive bytes, extracted IDs, payment credentials, or signed URLs enter logs or analytics. An adapter permits private local filesystem storage for a local-only fallback; storage remains outside public web assets and serves files through authorized routes.

OCR.Space receives only explicitly requested, permitted documents through the server. Display extracted text and uncertainty/error state for human confirmation; do not auto-approve or claim authenticity. Failure/timeout/quota never fabricates an OCR result and does not prevent manual review. Store extraction only as long as necessary under a declared retention policy.

Agreement generation snapshots accepted quote, agency terms, renter/service details, and obligations. Capture explicit consent, typed signer identity and electronic signature, UTC timestamp, document version/hash, and a downloadable record visible only to authorized parties. A changed quote/terms requires a new agreement. Do not make unsupported legal-enforceability claims.

## 9. Payments, refunds, deposits, and demo gateways

**Manuscript mode:** GCash QR/instructions owned by the relevant agency, receipt/reference/amount upload, manual verification against actual receipt; or Agency Admin recording received cash. Evidence states: submitted, rejected with reason, confirmed, reversed through a compensating record. Prevent duplicate confirmed references per appropriate agency/method scope and make retries idempotent. A rejected upload may be corrected without erasing review history. Cash records identify receiver/time. No automatic merchant settlement is claimed.

**Demo mode (user-authorized addition):** a prominent persistent "Demo payments — no money moves" label appears on method selection, confirmation, receipts, and reports. Server-controlled adapters simulate approved, declined, pending, cancelled, and retry outcomes for card/GCash/PayPal. Use fixed test tokens/options, never real card numbers, CVVs, banking credentials, PayPal passwords, or actual wallet login. A simulation produces a separate demo transaction with an idempotency key and explicit `DEMO` environment. It cannot create a live confirmed-payment record. In a demo booking only, successful simulation satisfies that booking's simulated payment gate; the booking, ledger, and report remain demo-labeled. Failed/pending simulations do not satisfy readiness. No live webhooks or payment secrets are necessary.

Agency-to-platform fees, if requested, must have their own contract, payee, fee basis, demo/live environment and records. They must never be confused with renter-to-agency collections or Cosigner earnings. No fee is charged merely upon submitting a partner application. Actual fee amounts/billing schedules require a supplied or explicitly approved policy.

All amounts are integer PHP centavos. Quote line items classify service revenue, refundable security deposits, discounts, taxes if explicitly configured, and separate fees. Snapshots preserve the source/basis of calculations. No unstated tax rates, late fees, cancellation percentages, or commission basis. Partial payments count only once; refunds cannot exceed eligible confirmed collections minus earlier refunds. Overpayment creates a reconciliation/credit item, not extra revenue.

Cancellation approval and refund payment are separate. Refunds move through requested, reviewed/approved or rejected, and paid with manual evidence; approving a refund does not mean money was sent. Security deposits remain liabilities until returned or an agreed, itemized deduction is accepted/reviewed. Return inspection does not automatically transfer the deposit into revenue.

## 10. Cosigner partnerships, commissions, and withdrawals

The Cosigner submits ownership evidence and a vehicle to an agency; the agency proposes/accepts a versioned commission agreement. Public listing requires operational and platform approval. Cosigner views only their owned vehicles and minimized associated booking data (dates, service status, financial allocation), not renter documents.

Agency platform commission and Cosigner revenue share are distinct policies. Both require explicit basis, rate, effective date, rounding, and applicable line-item classes. Do not assume that a platform commission percentage is also the Cosigner split. Signed/accepted booking policy snapshots prevent later rate edits from changing history.

After eligible booking completion/reconciliation, post immutable booking-linked ledger entries exactly once for gross eligible service amount, applicable commissions, adjustments, and Cosigner net earnings. Exclude refundable deposits, unconfirmed receipts, and simulated/live cross-environment funds. Refund adjustments use compensating entries; no editing historical earnings to conceal changes.

Withdrawals: requested → approved/reserved or rejected → paid with reference/evidence. Reserve available earnings atomically when a request is accepted into processing so concurrent requests cannot spend the same balance; release a rejected/cancelled reservation once. The available/requested/reserved/paid balances are distinct. Approval is not payout. Manual payout confirmation requires an authorized agency operator and produces one linked ledger effect. A post-payout refund is an explicit recovery/negative-adjustment case, not a silent withdrawal rewrite.

## 11. Notifications, reports, governance, and support

In-app notifications are durable, recipient-scoped, and transactional with the originating event. An outbox delivers optional email through Resend or an adapter with retry, deduplication, and delivery status. Missing provider settings display "not configured" to operators; do not claim delivery. A local development mail inbox can support test account verification/reset without sending messages to real people. No arbitrary user or third-party messaging is sent by development tools.

Reports derive from real persisted records with filters, date definitions, PHP units, and export. Distinguish requests, approved reservations, completed services, collections, refundable deposits, earned revenue, refunds, Cosigner liabilities, paid withdrawals, and platform fees. Agency reports are scoped; Cosigner reports are ownership-scoped; Super Admin aggregate reports clearly state aggregation. Demo and live figures are separated. Charts have equivalent accessible tables and empty states rather than sample numbers disguised as results.

Super Admin manages approval queues, accounts/suspension, terms/FAQ versions, commission policy, audit search, and reviewed privacy/retention requests. Audit events preserve actor, purpose/action, entity, agency, time, safe changed-field metadata and correlation ID; they exclude secret/private document payloads. Retention policies must be explicitly configured/approved before automatic erasure; review-only privacy workflows can operate while policies are unset. Audit tampering and unauthorized exports are denied. Sensitive exports require explicit purpose and permission.

Booking questions can use an authorized booking-linked discussion with notifications if needed. A standalone realtime chat product and Google/Facebook/TikTok OAuth are not part of the proposed first delivery: they are not required by the manuscript and need separate provider configuration/workflows. Existing UI buttons for these must not be carried over as nonfunctional controls. This proposed omission is disclosed for design approval.

## 12. Architecture and data boundaries

Proposed modules: identity/access, partner applications/policies, catalogs/compliance, resource availability, booking lifecycle, documents/OCR, quote/agreement, payment/refund/deposit, fulfillment/inspection, Cosigner accounting, notifications/outbox, reporting/governance.

Core record groups:

- Users, credentials/sessions/verification tokens, agency memberships and invitations.
- Agency applications/revisions/reviews, approved agencies, policy/payment/pricing revisions, platform policies.
- Vehicles/global identity, ownership/agency agreements, compliance reviews, maintenance, drivers/resource claims.
- Tours, itineraries, pricing versions, departures/slots and capacity claims.
- Bookings/items, requirement versions/reviews, state events, cancellation/service-change cases.
- Private files, OCR attempts, quotes/line items, accepted terms, agreements/signatures.
- Payment evidence/reviews/demo transactions, collections, refunds, deposit settlements.
- Pre/post inspections, handovers/returns, tour attendance/completion.
- Immutable financial entries, commission snapshots, withdrawal reservations and payout records.
- Notifications/outbox, audit events, privacy/retention cases.

Tenant-owned rows carry an agency relationship with foreign keys/constraints preventing cross-tenant links. User-owned records additionally enforce owner relationships. Domain transactions create state events, allocation/financial effects, notifications, and audit records together. Long-running external requests use an outbox/job result and do not hold database transactions open. Read models redact fields by role. The test suite must attack cross-tenant identifiers directly.

New Neon project proposal: dedicated Rent2Go project, Singapore region near the Philippines, development branch/database, small autosuspending compute within current account allowances. Record project/branch IDs, never secrets, in continuation docs. Use separate migration-owner and restricted runtime credentials where supported; keep all new secrets in ignored local environment files. No database reset commands against an unspecified URL. Integration tests use an explicitly identified isolated test database/branch. The old database and old .env are out of scope.

Local-only demo includes startup/setup commands, health/provider status, migrations, explicitly synthetic seed fixtures, four role walkthrough accounts with locally generated passwords, private demo evidence, backup/restore procedure, and a reset tool restricted to the designated new demo database with concrete target confirmation. Neon still needs internet; the fallback is local hosting, not guaranteed offline operation. An offline PostgreSQL option can be added only if explicitly needed and tested.

## 13. Screen/workflow inventory

- Public: home, agency directory/detail, rentals search/detail, tours search/detail, how booking works, partner application entry, FAQ/terms/privacy.
- Identity: registration/sign-in, verify email, reset password, invitation acceptance, profile/context switch, suspended/pending states.
- Applicant: application sections, save/resume, review/submit, status/revision/review response, approved next steps.
- Renter: bookings list and a single booking workspace with progress, next action, requirements, quote, agreement, payment, fulfillment/cancellation timeline.
- Agency: task queue/dashboard, application/policies, vehicles/compliance/maintenance/drivers, tours/departures, booking review/detail, payment/refund reconciliation, inspections, Cosigner partnerships/withdrawals, reports/settings.
- Cosigner: vehicle submissions/review, partnership agreement, owned booking utilization, earning statement, withdrawal request/history.
- Super Admin: agency and vehicle approval queues, approved agencies, account governance, platform policy/commission/FAQ, aggregate reports, audits/privacy cases.

Use shared headers/sidebar patterns and semantic status labels. Tables support filtering, pagination, empty/loading/error states; forms have persistent labels, field errors, saved-state feedback, and unsaved-change protection where relevant. Mobile navigation and dialogs must work by keyboard and touch. No tracking menu or unsupported fake controls.

## 14. Acceptance and evidence

The module checklist must separately record planned, implemented, locally verified, externally verified, and pending human acceptance. Passing code tests is not equivalent to client approval or usability evaluation.

Critical automated/integration coverage: agency revision/approval isolation, role escalation, two-agency leakage, private-file access, expired/replaced requirements, stale agreement, quote arithmetic, duplicate/rejected payment, demo/live separation, refund bounds, deposit treatment, overlapping approvals, overdue vehicle, tour oversell, driver conflict, cancellation after release, duplicate completion/earnings, concurrent withdrawals, notification/outbox isolation, suspension effects, and migration reproducibility.

Browser walkthroughs must include full rental and both tour modes, partner change-request/resubmission/approval, Cosigner listing/earnings/withdrawal, and Super Admin governance. Check desktop and narrow/mobile layouts, keyboard focus and form errors. Record build/commit, environment, tester/tool, date, expected/observed outcome, evidence and defects. OCR/email/storage external checks remain pending until executed with authorized new credentials. No live payment gateway validation is in scope.

Manuscript tests TST-01–09, 11–12 map to the modules above. TST-10 GPS is excluded by user direction and should be replaced in the revised manuscript, for example by agency onboarding and tenant isolation coverage, with the adviser/user's manuscript approval. Questionnaire/consent/sampling approval and real participant responses remain future human research work.

## 15. Implementation order and review boundaries

1. Foundation and **agency accommodation first**: new project/database, authentication, application forms and policy versions, Super Admin review, approval/changes flow, visual continuity and cross-agency tests.
2. Vehicles/Cosigner listing approval, tours/departures, availability and eligibility/recommendations.
3. End-to-end renter request, document/OCR review, quotation/agreement, manual payment and demo simulations.
4. Rental/tour fulfillment, cancellation/refund/deposit settlement, immutable earnings and withdrawals.
5. Reporting, notifications/email recovery, governance/privacy, evidence capture, walkthroughs and defect/retest work.

These are dependent delivery slices, not grounds for silently dropping later modules. Each slice gets a reproducible checkpoint and a concise account of remaining gaps. Publish code only to the specified new GitHub repository; never push environment files, manuscript copies, real personal documents, or old source/database artifacts. Graphify analysis depends on the user having a Graphify workspace/index of that repository; local implementation need not block on this external setup.

## 16. Approval record

The user approved this design and instructed beginning agency onboarding on 4 November 2026. Approval includes versioned configurable policies, demo/live separation, agency/platform vehicle approval, visual continuity, and deferring standalone realtime chat/social login. The user subsequently supplied the default allocation recorded above. No unspecified refund formula, retention duration, legal text, subscription fee, or research result is inferred.

## Confirmed pricing clarification — 4 November 2026

The user confirmed each agency chooses its driver fee unit. Configuration and exact agreement snapshots distinguish once per booking, per24 hours, per Manila calendar day, per hour and per vehicle billing unit. Missing legacy units are not inferred and do not authorize a with-driver estimate. A changed unit requires the normal revised policy/agreement workflow; old immutable snapshots remain unchanged. Driver compensation/allocation is a separate financial rule to clarify before ledger posting.

## Confirmed extra-charge allocation — 6 November 2026

The user approved agency-specific allocation configuration per extra-charge type, including damage, fuel and late-return charges, disclosed for explicit renter acceptance. Do not infer a charge amount, percentage or destination for unset configuration. Preserve the exact configured version and allocation with the accepted itemized assessment; later policy edits cannot change history. Rental revenue, including driver fees, follows its existing accepted revenue shares, and refundable deposits remain separate liabilities until an agreed disposition. Inspection acknowledgement alone does not accept a deduction or extra charge. Refund records continue to require independent review and separately recorded execution.
