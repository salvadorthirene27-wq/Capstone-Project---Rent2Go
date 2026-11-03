# Requirements and manuscript revision register

Source: user-supplied 82-page `RENT2GO_MANUSCRIPT (1).pdf`. References are absolute PDF pages. Do not publish the original PDF or extracted private manuscript text in this repository. This register records requirements, not implementation or testing success.

| Requirement | Source pages | Planned module/evidence |
| --- | --- | --- |
| Four role workspaces and permissions | 13–14, 19, 26, 45–49 | Server permissions, tenant/owner tests, role browser walkthroughs; TST-01 |
| Agency partnership approval/governance | 40–43, 48 | Versioned agency application, Super Admin review; user prioritizes expanded policy/pricing/payment forms |
| Vehicle and tour catalog/availability | 17–19, 26, 32, 37–38 | Catalog management, approved visibility, booking constraints; TST-02 |
| Consigned vehicle documents/review | 17, 22, 35, 46 | Ownership, agency partnership, platform compliance, Cosigner workspace; TST-09 |
| Rule-based recommendations | 14, 18, 26, 32 | Eligibility filtering, declared preference ranking, honest popularity |
| Request → human review → approval → quote → agreement | 20–21, 31, 33, 44 | Explicit lifecycle and immutable revisions; TST-03/05 |
| Private documents and OCR assistance | 13–14, 21, 26, 33, 49 | Private file authorization, OCR adapter, human final decision; TST-04 |
| Manual GCash/cash payment review | 14, 21, 26, 31, 34 | Evidence/review and collection records; TST-06 |
| Pre/post condition, release/return | 18, 26, 31, 34 | Inspection and fulfillment gates; TST-07 |
| Pre-release cancellation and reviewed refund | 21, 26, 31 | Independent cancellation/refund/settlement records; TST-08 |
| Tour-only fulfillment skips vehicle handover | 31 | Tour attendance/completion without artificial rental gates |
| Cosigner earnings, commissions, withdrawals | 17–19, 22, 26, 35, 46 | Versioned agreements, reconciled ledger, payout evidence; TST-09 |
| Analytics/reports | 18–19, 26, 37, 41, 55 | DB-backed, scoped, accessible figures/export, no fabricated metrics |
| Notifications, session/security, audit/privacy | 14, 22, 26, 40, 49, 55 | Outbox/email, scoped notifications, recovery, governance; TST-11/12 |
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

## Manuscript revisions for user/adviser review

1. Revise abstract/company profile/problem/objectives/scope and client-specific descriptions for multiple agencies. The source interview history may remain accurately attributed; do not rewrite history to claim research with agencies not consulted.
2. Remove GPS/geofencing from implemented features, objectives, workflow/use-case/architecture figures, tables, TST-10, conclusion and recommendations. Add the approved delimitation rationale. References need reconsideration where unused, rather than pretending integration occurred.
3. Describe both tour pricing/capacity models and agency onboarding/policy review. Distinguish renter payments, agency platform fees (if selected), and Cosigner settlements.
4. Describe demo gateway simulations separately from the manuscript's manual GCash/cash workflow. Do not report a simulated transaction as actual payment-provider integration.
5. Update repository reference to the new repository once source is pushed and its actual version identified.
6. Chapters 4–5 remain provisional. Replace screenshots/testing/evaluation placeholders only with actual evidence after the relevant build and human activities exist. No participant counts, scores, signatures, endorsements, or approvals are invented.

## Current evidence status

Manuscript text and the relevant raster diagrams have been studied. New application implementation, new database schema, new provider integration tests, browser walkthroughs, and human acceptance have **not** been completed. Older repository tests do not validate the replacement system.
