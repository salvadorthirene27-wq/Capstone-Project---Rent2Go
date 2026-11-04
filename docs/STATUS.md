# Implementation and evidence status

Updated 4 November 2026. This is a development record, not a capstone usability result.

## Working agency-onboarding slice

- Green/mint public introduction and partner guide; custom responsive sign-in and account creation.
- Persistent six-section partner application: business/evidence, services, terms, pricing, payment methods, configurable 70/10/10/10 consigned shares, and review/consent.
- Save/resume, field validation, stale-version protection, private registration/permit/GCash-QR evidence.
- Super Admin pending queue, full pending count and pagination; review details, request corrections, reject or approve with reasons; no self-approval.
- Immutable submitted policies/reviews and revision-specific evidence. Replacements supersede current files without deleting history.
- Approval creates agency access. Further policy revisions retain the prior approved policy until replacement approval. Withdrawn applications may be revised and resubmitted without granting agency access.
- Server-owned roles, cross-owner authorization, origin/body/type checks, database-backed request budgets, safe private downloads and audit records.
- Dedicated new Neon PostgreSQL project, managed Auth, private S3 bucket, restricted runtime role and separate automated-test database. No old environment/database used.

## Approved-agency discovery and workspace contexts

- Public `/agencies` directory supports agency/service-area search, service filtering, alphabetical ordering and pagination. Profile pages show the effective approved terms, unit-specific starting rates, public business contacts and accepted payment method names.
- Registration/representative details, private files, GCash account configuration, internal settlement preferences and financial allocations are excluded from the public projection. Unapproved amendments never replace the public policy.
- Approval backfills/creates explicit owner memberships. Agency operating context requires actual ownership or an active membership and an active agency/owner; a Super Admin role alone does not grant operating access.
- `/workspace` is a context chooser. `/workspace/application` preserves the saved application with explicit draft creation; visiting a workspace no longer creates an agency application.
- Responsive navigation supports keyboard Escape, real agency links and recoverable provider sign-out errors.
- Graphify workspace `gica-s-workspace` now indexes this repository. Its first query verified the source relationships at commit `8616e68`; local uncommitted work is not represented in that snapshot.

## Evidence already observed

- 19 unit/UI/configuration tests pass, including the delayed-save and already-pooled hostname regressions.
- 18 isolated live database tests pass, including concurrent saves/decisions, historical policy/evidence, old pending queue records, revised approved agreements, reopening withdrawn applications, and concurrent rate limits.
- TypeScript checks and the production build pass with the current `@neon/auth` 0.8.2 SDK.
- 25 real local API checks passed in production mode using the restricted runtime role: authentication, cross-owner/private-file denial, foreign-origin denial, S3 upload/download byte equality, corrections, resubmission, approval, policy amendment and resulting role. Earlier synthetic signup/session checks also passed.
- Browser: synthetic agency sign-in, business-form save, reload/session restoration, approved-state display, sign-out, Super Admin queue/all-applications/detail views. Desktop/mobile overflow checks passed. A reviewer-queue screenshot is retained with synthetic records.
- Public-bundle checks found none of the configured database URLs, cookie secret or storage secret in public JavaScript/map files.
- Fresh code review found three important issues (in-flight edit loss, evidence replacement ambiguity, queue truncation); regression tests were added and each fix passed. Explicit storage configuration and historical feedback display were also corrected.

The storefront/context slice additionally passed 19 production-mode HTTP checks for anonymous profiles, public projection privacy, literal wildcard search, validation, authenticated context selection and owner/foreign/reviewer operating boundaries. A fresh independent review found no actionable Task 1 findings. Desktop/mobile inspection exercised search empty states, navigation and policy disclosures; the search-icon spacing and mobile sign-out control were corrected in the bounded inspection pass.

## Provider and dependency boundaries

The earlier SDK package was replaced by the current `@neon/auth` package documented by Neon. The production dependency audit now reports zero known vulnerabilities. This is a dependency audit result, not a general security certification. The build-only Windows filesystem fallback retries asynchronous EPERM directory creation synchronously with the same options and OS permissions; genuine failures still propagate.

Production-mode checks caught an already-pooled hostname being given a second pooler suffix during local setup. The normalizer now handles unpooled, pooled and duplicate-suffix inputs; its regression passes and the actual restricted-role S3/application workflow has been exercised. Migrations still use the separate owner connection.

Password-recovery UI is implemented through managed email OTP methods, but actual email delivery/code receipt and human verification have not been demonstrated. Do not claim those external outcomes.

## Required work remaining

1. Vehicles, ownership/Cosigner partnerships, platform compliance, drivers and maintenance; tours and departure/private-slot capacity.
2. Marketplace search/filter/sort/details, explainable rule-based recommendations, persistent booking cart grouped by agency, and request checkout.
3. Booking state machine and transactional availability/capacity, requirement review/OCR, quotations, electronic agreements.
4. Manual GCash/cash payment evidence and demo gateway transaction adapters (current form only collects method preferences; it does not execute a gateway simulation yet).
5. Release/return inspections, tour-only fulfillment, cancellation/refund/deposit reconciliation.
6. Immutable earnings/commission/maintenance ledgers and withdrawal/payout workflows.
7. Operational reporting, notifications/email outbox, account/security/privacy governance, vouchers (rubric bonus), backup/restore exercise and role walkthrough evidence.
8. Actual adviser-approved human testing/usability evaluation and final Chapters 4–5.

GPS/geofencing is deliberately excluded. Standalone realtime chat and social OAuth were deferred in the approved design. Graphify is connected and its first indexed-source query has completed.

## Confirmed financial defaults for upcoming modules

| Service/ownership | Cosigner | Agency | Rent2Go | Maintenance reserve |
| --- | ---: | ---: | ---: | ---: |
| Consigned vehicle | 70% | 10% | 10% | 10% |
| Agency-owned vehicle | — | 80% | 10% | 10% |
| Tour-only | — | 90% | 10% | — |

The user confirmed these adjustable defaults and agency custody of a separate vehicle-maintenance reserve. The Cosigner's 70% applies to consigned cars; the agency-owned rule must never be applied to a Cosigner's car. Booking/vehicle agreements must snapshot the selected rates. Refundable deposits remain separate from service-revenue allocations.

## Vehicle backend foundation (feature branch; not a delivered UI yet)

The catalog feature branch now contains normalized physical-vehicle identity, derived personal/agency ownership, versioned offers, category-specific adjustable shares, agency proposals, exact-revision Cosigner acceptance, independent compliance decisions, explicit publication and durable withdrawal. Signed digests, submitted evidence references and state events are immutable. Effective agency service eligibility is rechecked before consent/approval/publication and in public projections. Actor/offer locks use a consistent order for concurrent approval and owner retries.

This foundation is not yet connected to customer-facing vehicle screens or APIs. Migrations006–007 are applied only to the separate `rent2go_test` database; the local demo database still has migrations001–005. File rows in the backend integration tests are synthetic fixtures, not evidence of a working vehicle upload/S3 round trip. The partner-document S3 checks above remain separate.

Additional evidence: 10 vehicle rule tests and nine live isolated vehicle scenarios pass, including durable owner withdrawal, approved agency service removal, immutable records and a deterministic concurrent approval/retry barrier. An independent review confirmed the three discovered defects were corrected with no remaining important findings in this backend scope. The entire current unit suite passes29 tests; the full integration suite passes27 tests and the final production build passes.

Next: finish vehicle file authorization/upload/download, owner/agency/platform queues and screens, then exercise the real restricted-role APIs and browser workflow before delivering the vehicle module. Vehicle transfer/removal against booking claims, resource calendars/drivers/maintenance, tours, marketplace catalog search, cart, bookings, payments, fulfillment and accounting remain unfinished.
