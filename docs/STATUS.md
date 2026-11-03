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

## Evidence already observed

- 17 unit/UI/configuration tests pass, including the delayed-save and already-pooled hostname regressions.
- 11 isolated live database tests pass, including concurrent saves/decisions, historical policy/evidence, old pending queue records, revised approved agreements, reopening withdrawn applications, and concurrent rate limits.
- TypeScript checks and the production build pass with the current `@neon/auth` 0.8.2 SDK.
- 25 real local API checks passed in production mode using the restricted runtime role: authentication, cross-owner/private-file denial, foreign-origin denial, S3 upload/download byte equality, corrections, resubmission, approval, policy amendment and resulting role. Earlier synthetic signup/session checks also passed.
- Browser: synthetic agency sign-in, business-form save, reload/session restoration, approved-state display, sign-out, Super Admin queue/all-applications/detail views. Desktop/mobile overflow checks passed. A reviewer-queue screenshot is retained with synthetic records.
- A public-bundle check found none of the configured database URLs, cookie secret or storage secret in 35 public JavaScript/map files.
- Fresh code review found three important issues (in-flight edit loss, evidence replacement ambiguity, queue truncation); regression tests were added and each fix passed. Explicit storage configuration and historical feedback display were also corrected.

## Provider and dependency boundaries

The earlier SDK package was replaced by the current `@neon/auth` package documented by Neon. The production dependency audit now reports zero known vulnerabilities. This is a dependency audit result, not a general security certification. The build-only Windows filesystem fallback retries asynchronous EPERM directory creation synchronously with the same options and OS permissions; genuine failures still propagate.

Production-mode checks caught an already-pooled hostname being given a second pooler suffix during local setup. The normalizer now handles unpooled, pooled and duplicate-suffix inputs; its regression passes and the actual restricted-role S3/application workflow has been exercised. Migrations still use the separate owner connection.

Password-recovery UI is implemented through managed email OTP methods, but actual email delivery/code receipt and human verification have not been demonstrated. Do not claim those external outcomes.

## Required work remaining

1. Approved agency storefronts; vehicles, ownership/Cosigner partnerships, platform compliance, drivers and maintenance; tours and departure/private-slot capacity.
2. Marketplace search/filter/sort/details, explainable rule-based recommendations, persistent booking cart grouped by agency, and request checkout.
3. Booking state machine and transactional availability/capacity, requirement review/OCR, quotations, electronic agreements.
4. Manual GCash/cash payment evidence and demo gateway transaction adapters (current form only collects method preferences; it does not execute a gateway simulation yet).
5. Release/return inspections, tour-only fulfillment, cancellation/refund/deposit reconciliation.
6. Immutable earnings/commission/maintenance ledgers and withdrawal/payout workflows.
7. Operational reporting, notifications/email outbox, account/security/privacy governance, vouchers (rubric bonus), backup/restore exercise and role walkthrough evidence.
8. Actual adviser-approved human testing/usability evaluation and final Chapters 4–5.

GPS/geofencing is deliberately excluded. Standalone realtime chat and social OAuth were deferred in the approved design. Graphify has no workspace/index yet, so graph analysis has not been performed.

## Confirmed financial defaults for upcoming modules

| Service/ownership | Cosigner | Agency | Rent2Go | Maintenance reserve |
| --- | ---: | ---: | ---: | ---: |
| Consigned vehicle | 70% | 10% | 10% | 10% |
| Agency-owned vehicle | — | 80% | 10% | 10% |
| Tour-only | — | 90% | 10% | — |

The user confirmed these adjustable defaults and agency custody of a separate vehicle-maintenance reserve. The Cosigner's 70% applies to consigned cars; the agency-owned rule must never be applied to a Cosigner's car. Booking/vehicle agreements must snapshot the selected rates. Refundable deposits remain separate from service-revenue allocations.
