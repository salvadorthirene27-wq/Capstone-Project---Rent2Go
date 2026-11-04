# Implementation and evidence status

Updated4 November2026. This records development with synthetic data, not capstone usability findings.

## Working modules

- Managed account sign-in/registration and server-owned roles; password recovery UI uses managed OTP. Actual recovery email delivery remains unverified.
- Persistent six-section agency onboarding with private evidence, validated pricing/policies/payment preferences and configurable consigned shares. Reasons, corrections/resubmission, independent approval, immutable revisions/evidence/history and stale locks are implemented.
- Approved agency directory with search/service filters/pagination; effective-policy-only profiles omit registration/identity evidence, settlement details and allocations. Membership-based workspaces and explicit application startup preserve renter/Cosigner context.
- Personal and agency-owned vehicle drafts; normalized global registration identity; ownership evidence and photos; scoped owner/agency/platform queues; agency terms proposals; explicit exact-revision Cosigner consent; independent platform compliance; publication; durable withdrawal and revised submissions. Agency-owned cars skip Cosigner negotiation but still require compliance review.
- Agencies see submitted snapshots, not unsubmitted personal drafts or replacement evidence. Uploads recheck owner/state/version before and after storage. Only photos in the approved published revision are anonymous; ownership evidence and withdrawn photos remain protected.
- Signed digests, evidence references, decisions and history are immutable. Defaults remain consigned70/10/10/10, agency-owned80/10/10 and tour-only90/10, with100% accepted totals and deposits separate. Consigner role is granted after approved personal-vehicle compliance without overwriting other privileged roles.
- Group and private tour drafts, private photos, immutable publication/policy/commission snapshots, available dates, capacity rules and cancellation history are implemented. Private slots reject overlaps in PostgreSQL; group departures allow independent overlapping services. Public tour search/detail pages provide keyword/model/party filters, unit-price sorting, itinerary, requirements and terms. Tour-only operator transport does not create a customer vehicle rental.
- Vehicle/driver calendars now enforce half-open interval conflicts in PostgreSQL, including concurrent writes. Private driver roster validates normalized license identity and validity through assignments. Cosigner blocks cannot be cleared by the agency; maintenance completion preserves actual cost and history without creating a financial payout. Manual endpoints cannot create/cancel booking claims.
- Private new Neon project, managed Auth, S3 partner-evidence bucket, restricted runtime role and separate test database. Demo and test schemas now both have migrations001–010. No old environment/database is used.

## Verification observed

- Latest full suites:42 unit/UI checks and52 isolated live database checks pass. TypeScript and production build pass. A prior resource run interrupted by DNS/connection resets was followed by a clean full combined run; that interruption is not hidden as a pass.
- Real local production API evidence:45 consigned-vehicle checks and13 agency-owned checks passed using new managed Auth/database and real S3 upload/downloads. They exercise forged ownership/tenant denial, pre-submission privacy, exact agreement revisions, independent compliance, publication, withdrawal and historical/replacement evidence. The agency-owned flow correctly has no Cosigner agreement and keeps category shares.
- Tour production API evidence:69 checks pass across group and private packages, including real S3 upload/download byte equality, draft/current-public photo access, independent tenant/origin checks, pricing units, schedules/overlaps, cancellation history, pagination and withdrawal.
- Resource production API evidence:43 checks pass, covering authenticated scope/origin/forgery denial, normalized driver duplicates, invalid windows, overlap/adjacency/concurrency, preserved cancellation, maintenance costs/completion, owner control, inactive drivers and private page access.
- New resource/tour UI visual walkthrough is pending: Windows browser automation stopped because it could not reliably verify the current Chrome URL. No resource screenshot or mobile-layout success is claimed. Driver edit-loss behavior is covered by a failing-then-passing interface regression.
- Earlier agency slice:19 storefront/context checks and25 onboarding checks passed; these are separate stage records, not a claim of full-system coverage.
- Browser: desktop creation form and owner agreement screen; mobile layout/no overflow, explicit consent enabling/disabling, and version disclosures. Existing agency signup/save/reload/review navigation was previously exercised. Synthetic vehicle owner screenshots are retained in outputs.
- Public bundle check77 JavaScript/map files found no configured database, cookie or S3 secret. Staged source scans run before commits.
- Independent review identified and verified fixes for pre-submission privacy (including mutation responses) and dirty-edit loss from evidence removal, alongside the earlier service-eligibility/withdrawal/lock-order fixes. No important findings remain within the reviewed vehicle scope.

- Tour review found a successful-save/refresh editing race; it is fixed in tour, resource and vehicle editors with three observed RED-to-GREEN regressions. Fields stay locked until refreshed saved data arrives and failures retain edits. Fresh tour review found no Critical or other Important issue.

## Still required

1. Resource-aware agency transfers/removal and the blocked resource/tour UI visual walkthrough.
2. Transactional booking allocation against tour capacities/slots; the tour catalog does not itself create a booking.
3. Complete rental marketplace filtering/sorting/details, richer tour date filters and explainable recommendations; persistent cart grouped by agency and booking requests.
4. Full request/documents/human review/OCR/approval/quote/agreement lifecycle; manual cash/GCash and labeled demo payment transactions. Current agency methods are preferences, not a gateway transaction simulator.
5. Release/return inspections and tour fulfillment; separate cancellation/refund/deposit reconciliation.
6. Immutable earnings/commission/maintenance ledgers, withdrawals/payouts, reporting, notifications/outbox, account/privacy governance, vouchers (bonus), backup/restore exercise and complete role walkthroughs.
7. Actual human testing/usability evidence and final Chapters4–5. Never fabricate results.

Ownership transfer is not exposed yet; withdrawing retains history and blocks agency republishing until a new reviewed submission. The public vehicle feed is a bounded interim view; comprehensive search/pagination/availability follows with the marketplace task.

GPS/geofencing is excluded. Standalone realtime chat/social OAuth are deferred by the approved design. Local demo only; no real charges or public deployment. Graphify workspace gica-s-workspace is connected; its last confirmed index79d4686 does not represent current uncommitted feature work.

## Runtime notes

Use current @neon/auth0.8.2. The production dependency audit previously reported zero known vulnerabilities; it is not a security certification. Already-pooled hostname normalization and build-only Windows EPERM mkdir fallback have regressions/verification. New runtime table grants accompany migrations, with repeatable setup grants for existing tables. Never print or commit the ignored environment or synthetic account credentials.
