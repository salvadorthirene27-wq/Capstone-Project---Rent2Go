# Requirements and manuscript revision register

Authority updated 5 November 2026: user-approved 82-page `RENT2GO_REFINED_MANUSCRIPT.pdf`, SHA256 `3c6e8265f0b5ba96b54c92f6e654e3abd488a057ada98339f9a2843867521236`. References below are absolute PDF pages; the refined manuscript retains the original pagination. Keep private manuscript text outside this public repository. The revised body, together with user decisions, defines the unified system architecture. The preserved first 11 preliminary pages contain superseded scope wording. Current implementation evidence belongs in STATUS.md; the completion sequence is recorded in docs/superpowers/plans/2026-11-05-manuscript-completion.md.

| Requirement | Source pages | Planned module/evidence |
| --- | --- | --- |
| Four role workspaces and permissions | 13–14, 19, 26, 45–49 | Server permissions, tenant/owner tests, role browser walkthroughs; TST-01 |
| Agency partnership approval/governance | 40–43, 48 | Versioned agency application, Super Admin review; user prioritizes expanded policy/pricing/payment forms |
| Vehicle and tour catalog/availability | 17–19, 26, 32, 37–38 | Catalog management, approved visibility, booking constraints; TST-02 |
| Consigned vehicle documents/review | 17, 22, 35, 46 | Ownership, agency partnership, platform compliance, Cosigner workspace; TST-09 |
| Rule-based recommendations | 14, 18, 26, 32 | Eligibility filtering, declared preference ranking, honest popularity |
| Request → human review → approval → quote → agreement | 20–21, 31, 33, 44 | Explicit lifecycle and immutable revisions; TST-03/05 |
| Private documents and OCR assistance | 13–14, 21, 26, 33, 49 | Private file authorization, exact-document OCR consent/jobs/results and independent human comparison implemented; actual synthetic provider and role/race checks; TST-04 |
| Manual GCash/cash payment review | 14, 21, 26, 31, 34 | Evidence/review and collection records; TST-06 |
| Pre/post condition, release/return | 18, 26, 31, 34 | Inspection and fulfillment gates; TST-07 |
| Pre-release cancellation and reviewed refund | 21, 26, 31 | Independent cancellation/refund/settlement records; TST-08 |
| Tour-only fulfillment skips vehicle handover | 31 | Tour attendance/completion without artificial rental gates |
| Cosigner earnings, commissions, withdrawals | 17–19, 22, 26, 35, 46 | Versioned agreements, reconciled ledger, payout evidence; TST-09 |
| Analytics/reports | 18–19, 26, 37, 41, 55 | Implemented scoped DB-backed statements, Philippine dates, accessible chart/table and audited exact CSV; see workflows/financial-reports.md; no fabricated metrics |
| Notifications, session/security, audit/privacy | 14, 22, 26, 40, 49, 55 | Recipient inbox/read receipts and transaction-linked vehicle/owner-review delivery implemented; email outbox, recovery and governance pending; TST-11/12 |
| GPS/geofencing | Many pages including 18, 26, 39, 49, 66 | **Excluded by user. Do not implement.** |
| Formal testing and usability evidence | 27–29, 50, 56–75 | Real build-linked tests, defect/retest log; human evaluation remains pending |

## Explicit user decisions after manuscript

- Multiple agencies; VSME is not a pilot or privileged client.
- GPS/geofencing excluded because agencies already have their own arrangements.
- Both scheduled per-person and private per-party tours.
- Code-first UI, complementing the existing develop interface.
- Local demo initially, using a new Neon database and the new user-owned repository.
- Agency accommodation is the first implementation priority; application includes terms, pricing, and payment details.
- Hardcoded **demo** payment simulations (e.g. card, GCash, PayPal) are authorized; no real gateway settlement is represented.

## Historical revision decisions (now reflected in the approved manuscript)

1. Revise abstract/company profile/problem/objectives/scope and client-specific descriptions for multiple agencies. The source interview history may remain accurately attributed; do not rewrite history to claim research with agencies not consulted.
2. Remove GPS/geofencing from implemented features, objectives, workflow/use-case/architecture figures, tables, TST-10, conclusion and recommendations. Add the approved delimitation rationale. References need reconsideration where unused, rather than pretending integration occurred.
3. Describe both tour pricing/capacity models and agency onboarding/policy review. Distinguish renter payments, agency platform fees (if selected), and Cosigner settlements.
4. Describe demo gateway simulations separately from the manuscript's manual GCash/cash workflow. Do not report a simulated transaction as actual payment-provider integration.
5. Update repository reference to the new repository once source is pushed and its actual version identified.
6. Chapters 4–5 remain provisional. Replace screenshots/testing/evaluation placeholders only with actual evidence after the relevant build and human activities exist. No participant counts, scores, signatures, endorsements, or approvals are invented.

## Current evidence status

The approved manuscript and revised workflow figures have been reviewed. New-system development evidence is recorded per module in STATUS.md; formal human usability results remain uncollected. Tests from Marc Albert's repository do not validate this system.

Notification email evidence: optional verified-session opt-in, five transaction-linked future-event sources, recipient history, definite-rejection retries, unknown-outcome recovery and one user-confirmed sender-only Gmail message. See workflows/email-updates.md. Managed Auth verification/reset delivery and full operational launch/recovery remain distinct verification items.

Account-security evidence: authenticated current-account verification, three-step code/password recovery, current-password refusal at the application auth proxy, preserved application roles/suspension and fresh consent after email changes. Live user-performed registration/verification/reset/reuse-refusal/new-sign-in and scoped session-ID revocation checks are recorded in workflows/account-security.md.

Closed financial credit/recovery evidence: original close and payout history stay immutable; exact source-bound agency proposal, separate renter acceptance and minimized original-Cosigner future-recovery consent precede conserved compensating entries. Credit-linked refunds retain collection ceilings and independent payment evidence. Owner balances/reports distinguish gross, accepted reductions, net earned, paid and recoverable amounts. The posting/withdrawal race and later-earnings offset are covered by isolated database tests. See workflows/closed-credits.md; platform remittance is now implemented separately; complete restore/defense evaluation remains open.

Platform remittance evidence: immutable original-platform allocations, exact agency reservations, private manual claims and independent receipt review, labeled fixed simulations, and separate exact agency acceptance/application of excess after posted credits. Reports distinguish cash receipts from accepted/applied credits and do not silently net unaccepted excess against other services. Current source authorization controls protected receipts, evidence and the fifth REMITTANCE notice/email source. Native concurrency/financial conservation and four-role actual API checks passed; desktop/mobile/print review awaits local browser access. See workflows/platform-remittances.md.
