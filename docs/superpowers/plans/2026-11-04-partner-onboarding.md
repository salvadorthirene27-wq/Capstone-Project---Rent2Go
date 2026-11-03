# Partner Onboarding Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Track completed checks below.

**Goal:** Deliver a persistent, authenticated partner application and Super Admin review workflow with configurable terms, pricing, payment methods and revenue sharing.

**Architecture:** One Next.js TypeScript app. Managed Neon Auth supplies identity; application tables own role/agency permissions. PostgreSQL transactions serialize application revisions/decisions and persist audit/notifications. Private file storage serves evidence only after authorization.

**Tech Stack:** Next.js App Router, React, TypeScript, pg, Zod, Vitest, Neon managed Better Auth, private storage adapter. Choose current compatible package versions from official documentation/registry.

**Spec:** `docs/superpowers/specs/2026-11-04-rent2go-design.md` (approved).

## Global Constraints

- New repository/database only; no old environment or source copied.
- Multiple agencies, no pilot client, no GPS/geofencing.
- Preserve forest green/mint identity and dashboard patterns; responsive accessible forms.
- Defaults: Cosigner 70%, agency 10%, Rent2Go 10%, maintenance 10%; configurable basis points totaling 10000.
- Agency-to-platform payments and renter accepted methods are separate settings.
- Demo card/GCash/PayPal simulate payment only, never store real card/wallet credentials.
- No new production deployment, paid upgrade or live charge.

## Review Focus

- A stale browser revision must not overwrite a reviewed/approved application.
- Applicant-supplied roles/IDs must never grant Super Admin or another agency's access.
- A corrected application must preserve the old submitted version and reviewer feedback.
- Percentage fractions, unset financial fields and contradictory policy text must produce actionable validation.
- Missing identity/storage/provider configuration must fail visibly without presenting a successful workflow.

## File boundaries and interfaces

- `src/modules/partners/schema.ts`: Zod schema, defaults, percentages and publication validation.
- `src/modules/partners/workflow.ts`: pure role/state/revision gates.
- `src/modules/partners/service.ts`: `saveDraft(actor,input,version)`, `submitApplication(actor,id,version)`, `reviewApplication(actor,id,version,decision,reason)`; transactional persistence.
- `src/lib/db.ts`: pg pool and `transaction(fn)` helper; migration target is explicit.
- `src/lib/auth.ts` / `auth-client.ts`: managed Auth integration and server `requireActor()`; never accept a role from a request.
- `src/lib/storage.ts`: private evidence upload/read with safe key and validated content.
- `src/app/api/*`: thin authenticated request validation, error mapping, and origin checks.
- `src/app/partners/*`: application entry, dashboard, form, revision/status views.
- `src/app/admin/*`: reviewed queue and application review.
- `db/migrations/*.sql`: additive versioned application schema/constraints.
- `scripts/migrate.ts`, `scripts/bootstrap.ts`: explicit new DB setup and controlled admin assignment.
- `tests/partners*.test.ts`, `tests/integration/*.test.ts`: domain and live DB isolation/concurrency checks.
- `docs/STATUS.md`: evidence and remaining module checklist; never inherit old tests as new evidence.

### Task 1: Contract and workflow rules

- [ ] Write failing schema tests for a complete application, trimmed whitespace, invalid methods, negative/fractional invalid percentages, split total, missing terms/payment/rate/deposit rules, and unset versus zero.
- [ ] Write failing workflow tests for owner-only edit/submit, Super Admin-only review, required decision reason, legal state transitions and stale version conflict.
- [ ] Run targeted Vitest, confirm missing implementation failure, then implement the contracts and gates.
- [ ] Confirm tests pass; preserve default 7000/1000/1000/1000 basis points.

### Task 2: New database and transactional service

- [ ] Provision dedicated `rent2go-capstone-2026` project in Singapore with small autosuspending compute; record IDs, keep credentials in ignored files. Enable managed Auth and private evidence storage if supported.
- [ ] Add SQL migrations for actors, applications, immutable submitted revisions, reviews, approved agency/policy snapshot, audit events, private-file metadata and notifications. Enforce status/ownership/version invariants.
- [ ] Write live integration tests for two owners, cross-owner access denial, concurrent save/submit conflict, change request/resubmission preserving revisions, approval gating, duplicate decision conflict and approved revision stability.
- [ ] Implement transactional services against those contracts. Review locks the application; save uses expected version; submit snapshots payload; review affects the exact submitted revision. Return `{id,version,status}` and safe conflict/errors.
- [ ] Run tests against isolated test data in the designated new database; no destructive reset of old or unspecified databases.

### Task 3: Identity, evidence, and API boundaries

- [ ] Wire Managed Neon Auth per installed SDK documentation; implement registration/login/logout/session restoration and recovery UI.
- [ ] Resolve application role from a server-owned actor table; default new users to renter/applicant permissions. Controlled bootstrap assigns Super Admin by verified identity, never public input.
- [ ] Add guarded JSON API handlers; reject unsafe origins, malformed bodies, unknown methods and excessive payloads; check ownership on list/detail/file access and each mutation.
- [ ] Implement private evidence upload with content signature/type/size validation; authorize subsequent reads by owner/reviewer; no public bucket/path exposure.
- [ ] Verify unauthenticated, forged-role, foreign-owner, stale-version and private file requests fail correctly. Exercise sign-up/sign-in/sign-out/reload on the actual new app.

### Task 4: Matching partner and review screens

- [ ] Read Impeccable craft-floor immediately before UI code. Record incumbent green/mint tokens and surface brief; preserve familiar header/sidebar/light-surface patterns.
- [ ] Build public partner explanation, authenticated application dashboard, six form sections, save/resume, review summary, submit/status, feedback/correction/resubmit and approved next steps.
- [ ] Build Super Admin queue/detail with reviewed payload/evidence, approve/request changes/reject, version safety and decision reasons.
- [ ] Show explicit basis-point percentages as human percentages and explain total validation. Collect accepted renter methods separately from platform settlement preference. Put persistent demo labels beside simulated methods; do not collect PAN/CVV or wallet passwords.
- [ ] Ensure persistent labels, field-error links, keyboard focus, pending/error/success feedback, unsaved change protection and mobile navigation.
- [ ] Run build/typecheck/unit/integration checks. Batch desktop/mobile browser inspection; fix observed defects once and confirm. Run fresh code review and address serious findings with regression tests.
- [ ] Commit/push working slice with honest STATUS/continuation, local walkthrough instructions and provider limitations.

## Following delivery plans

After this working slice, expand in the approved dependency order: catalogs/vehicle compliance/Cosigner partnerships and tours/availability; booking/documents/OCR/quote/agreement; manual/demo payments and fulfillment; cancellation/refunds/deposits/earnings/withdrawals; reports/governance and evidence. Write focused plans at each boundary, without reopening approved scope. These remain required future work and must be shown as pending until implemented and verified.

## Self-review

This plan covers design sections 3–4 and the foundations of sections 8–9, 11–14. Later operational/financial modules are explicitly pending, not dropped. The interfaces above match the tests/tasks. Business fields have explicit validation and review; all mutable versions use optimistic concurrency, all review decisions use a locked transaction. No arbitrary legal policy or unapproved fee is generated.
