# Refund verification and exact-source statement checkpoint — 9 November 2026

The provider client now retrieves and validates exact refund resources without issuing a refund. Original payment/merchant/mode/amount/reference matching, stale/terminal observation guards and original-gross reservation budgets are implemented. Central custody now prepares a deterministic statement from original receipt, collection and closed revenue-entry sources. Agency-only fees are attributed with exact integer rounding; protected Cosigner/maintenance/platform allocations stay intact. Statements remain read-only and cannot authorize a transfer or release owner funds. See [scope, sources and remaining workflow](workflows/paymongo-refund-statements.md).

566 full unit/interface cases,27 focused final checks,10 native custody cases, production build and sequential TypeScript pass. Primary four-role custody16 and operational health14 pass.98 protected source-history fingerprints and two contact plans remain unchanged. There is no new migration, actual provider refund, transfer, payment, email or primary financial mutation. Gateway activation and general email dispatch remain off.

Durable agency destination/statement review, independently documented execution and receipt confirmation, exact source-based owner availability release, fee-shortfall funding, provider refund approval/dispatch/ambiguity handling/posting, later adjustments and customer checkout remain open. This checkpoint is a financial verification foundation, not100% or deployment acceptance of the payment expansion.

--- Earlier checkpoints ---

# Notification dropdown and renter dashboard checkpoint — 9 November 2026

The bell now opens a dropdown with global mark-all-read, individual delete, read-only bulk deletion, Undo and a Deleted/restore view. Account contains email preferences. Workspace home shows cart services, current requests and history with photos, dates, status and accurately labeled estimates/quotations. Pure renters no longer see My vehicles; existing owner/agency relationships retain their tools. Cart includes its icon, sidebar spacing is tighter and current display names do not rewrite historical snapshots. See [workflow and evidence](workflows/dashboard-notifications.md).

544 unit/interface, eight final focused cases,12 native database cases, four-role HTTP48, production build and sequential TypeScript pass. Actual desktop/phone/narrow-phone/tablet checks pass. Migration049 alone adds reversible visibility and immutable command history on primary;98 original protected table fingerprints and two contact plans remain unchanged. A single notification was deleted and restored through the UI. No primary read receipt, financial action or communication was created. Gateway and general email dispatch remain off. Disbursement execution/source release, provider refunds and customer checkout remain open.

--- Earlier checkpoints ---

# Grouped workspace and notification bell checkpoint — 9 November 2026

Notifications are now a top-bar bell with a red unread dot, including while mobile menus are closed. The sidebar uses one Account, one My vehicles and one Agency partnership entry. Vehicle inventory, calendars, earnings and reports share tabs; Account contains security and privacy requests; the application includes its six-section guide. Existing saved routes, privacy history, restricted access and financial permissions are preserved. See [workflow and evidence](workflows/workspace-hubs.md).

Verified536 full unit/interface cases,8 native inbox/count cases, production build and sequential type checking. Four-role grouped-workspace/count HTTP73 plus existing header26/workspace19/health14 checks pass. Actual1440desktop/375phone/320narrow-phone/768tablet review confirms a visible46px bell, red existing-unread indicator, responsive tabs, no overflow, menu keyboard focus/Escape, integrated account/application navigation and financial-record retention. Zero-count clearing and race/failure states are covered by native/component tests; no primary read receipts were changed for this check.98 original primary history/booking/financial table hashes and the two contact plans still match. No draft application, privacy request, email/code or financial action was submitted. Original tabs/session were preserved and viewport reset.

No migration or grant was added. Payment processing and general email dispatch remain disabled. The user's interface requests were prioritized before agency-disbursement implementation; that financial execution/source-release work, provider refunds/adjustments, customer checkout and final gateway activation remain open. This is not100% completion or deployment acceptance of the PayMongo expansion.

--- Prior checkpoints retained ---

# Central custody and owner-availability checkpoint — 9 November 2026

Verified PayMongo receipts now have a scoped read-only custody projection and a collapsed section on independent agency booking screens. Gross receipts, agency-borne provider fees and provider net receipts are distinct; a bank settlement or agency transfer is never inferred. Closed allocation projections preserve Cosigner, maintenance and platform amounts, deduct fees only from the agency share, and expose agency fee shortfalls without spending protected allocations. A source mismatch, pending notification, late receipt, incompatible channel or later financial adjustment withholds the spendable projection. See [custody workflow](workflows/paymongo-custody.md).

Owner account/detail, directory and reports exclude centrally held net allocations from withdrawable earnings while preserving the original earned ledger. Successful payout execution rechecks agency-held coverage for all approved reservations; failed/cancelled pending outcomes remain resolvable without a debit. Platform commission from centrally collected bookings is excluded from ordinary agency remittance dues and shared report calculations. Current accounting headings now prefer the agency display name; historical receipts/agreements retain their saved names.

Verification:507 full unit/interface checks pass, with10 focused presentation/API cases after the final heading/copy correction. Eight new native custody cases and26 existing owner-withdrawal/remittance/report/closed-credit regressions pass (34 distinct database cases; the final custody/withdrawal run also repeats all7 withdrawal cases). The initial custody fixture failed because one SQL parameter was inferred as both integer and bigint; explicit fixture casts corrected it without relaxing business assertions. Final production build and sequential type checking pass. Four-role custody HTTP16, shared navigation26, workspace19 and service-health14 checks pass. Original98 history/booking/financial table fingerprints still match, with the two original contact plans preserved.

Actual1440desktop and375phone checks cover the current sample Cosigner account, correct display name, explicit centrally-held card, unchanged available earnings and recorded payouts, return links and no horizontal overflow. The sample has zero centrally-held funds. Populated custody/held-fund/fee-shortfall states are verified by isolated database and component tests, not claimed as primary browser payment transactions. Original renter session, tabs and viewport were restored. The reservation-expiry worker was found stopped after connection resets; its replacement successful batch is verified. No network configuration or credential change is claimed as a root-cause fix.

No new migration or permission grant is required. Primary remains001–041 plus045 and047; isolated test remains001–048. Payment processing and general email dispatch stay disabled. No customer message, provider payment/refund, agency transfer or owner payout was executed. Reviewed agency-disbursement evidence and exact source releases, agency funding, provider refunds and central adjustments, customer checkout and final activation remain open. This is not100% completion of the PayMongo expansion or deployment acceptance.

--- Prior checkpoints retained ---

# Signed payment notifications and review queue checkpoint — 9 November 2026

The PayMongo notification path now authenticates bounded raw deliveries, commits a privacy-limited immutable inbox, deduplicates semantic retries, preserves conflicting facts and feeds verified receipts into the existing supervised worker and atomic booking posting. Pending events and mismatches fence conflicting booking/financial actions; late funds cannot reclaim inventory. A read-only Super Admin reconciliation queue uses the shared workspace, labelled filters and explicit verified/expected/declared amount provenance. Viewing a case cannot resolve it or execute a refund/disbursement. See [workflow and boundaries](workflows/paymongo-notifications.md).

Verified499 full unit/interface checks;10 new native notification cases and27 lifecycle/posting/worker regressions; production build and sequential type checking;20 four-role queue/callback checks plus26 header,19 workspace and14 service-health checks. Final filter-layout reuse has3 focused interface regressions. Desktop1440/phone375 checks cover the actual primary's records-unavailable queue, controls and return navigation; populated-case verification is isolated database/interface evidence. Primary's98 original history/booking/financial table fingerprints remain unchanged. A transient connection interruption recovered without configuration or credential changes; the reservation-expiry worker was restarted and its successful health batch verified. Transaction handling now preserves the original error if rollback fails and does not replay writes.

Migration048 is isolated-only (test001–048); primary remains001–041 plus045 and047. No provider webhook has been registered; provider payment processing and general email dispatch remain disabled. No real payment/refund/transfer/customer communication occurred. Central custody/disbursement, reviewed financial dispositions, provider refunds/additional balances, customer checkout and final end-to-end activation remain open. This checkpoint does not establish100% completion or deployment readiness.

--- Prior checkpoints retained ---

# Agency contact and follow-up checkpoint — 9 November 2026

The approved optional agency contact log is implemented: active independent agency staff can assign colleagues, save a follow-up plan, and record an already-made phone/email attempt. The agency queue lists scheduled/overdue follow-ups and links to the exact contact section. Forms and history are expandable and use the existing workspace. The log is private to the actual agency; it never sends communications, reserves stock, accepts a quotation, cancels a request or changes payment rules. Quotation issuance/closure makes it read-only, and pending cancellation pauses edits. See [workflow](workflows/agency-contact-log.md).

Verification:485 full unit/interface cases passed, plus final focused12 form/API/queue cases and2 link cases after visual corrections. Native8 contact cases plus3 restricted-role/cancellation/inactivity cases and20 existing booking-request/quotation regressions all pass (31 database cases). Final production build and sequential type checking pass. Four-role HTTP contact checks passed16 before the walkthrough and17 afterward; the latter verifies exactly two plan-history records and an unchanged original booking response. Existing navigation26, workspace19 and service-health14 checks pass. The reservation-expiry worker remains healthy; payment processing and notification email dispatch remain disabled.

Actual desktop1440 and phone375 checks passed readable16px fields,44px actions/disclosures, stable date retention, saved schedule, contact-method controls, sidebar navigation, queue-to-contact navigation and no horizontal overflow. Native datetime input handling was corrected after browser review caught a reset; a regression now covers input retention and Manila conversion. The queue uses an ordinary document anchor for its deep jump after client navigation produced a duplicated fragment; the final URL and target position were verified. The browser’s original sample renter session was restored, original tabs kept and the temporary tab closed; viewport override was reset.

Only additive migration047 was applied to the application database; primary is001–041 plus045 and047, isolated test is001–047. Before/after fingerprints of98 existing history/booking/financial tables match, including after the walkthrough. A private before-image and snapshot of the new contact records were saved. The sample under-review request has two assignment/plan records, the latest scheduled for10 November2026 at10:00AM Philippine time; neither claims a customer was contacted. No contact-attempt record, actual call/email, document review, quotation approval, payment, refund or transfer was performed on the application database. The private guide now has32sections/171steps; credentials are unchanged and remain outside Git.

Remaining PayMongo notification/reconciliation, custody/disbursement, provider-refund and customer-checkout work remains open; this module does not establish100% completion or deployment readiness.

--- Prior checkpoints retained ---

# Supervised payment-status worker checkpoint — 9 November 2026

The internal PayMongo status worker now connects due configured-account checkouts to receipt verification and atomic booking posting, with a separate named process lease, cooldowns, crash recovery and sanitized run history. Existing quotation-expiry APIs retain their contract. Service health separately reports payment-worker disablement/configuration/schema readiness, contact and successful batch time; it does not equate processing with payment, refund or disbursement.

Verification:473 unit/interface cases,6 new native worker cases,26 existing lifecycle/posting/expiry-worker regressions, production build and sequential type checking pass. Four-role HTTP service-health checks pass on the rebuilt application. Native provider responses were synthetic; no actual payment/provider creation/refund/transfer or email was sent. Migration046 is isolated-test-only. Primary remains001–041 plus045, PayMongo is disabled, and no payment worker has been started against it. This is internal polling/supervision completion, not completion of signed notifications, the reviewed exception queue, central accounting/disbursements, provider refunds, customer checkout or deployment readiness. See [worker workflow](workflows/paymongo-worker.md).

The user approved the optional agency contact log on9 November. Its staff assignments, contact attempts and follow-ups are the next independent module; it must preserve portal acceptance and current payment rules. The approved log is not implemented by this worker checkpoint. No separate pre-registration enquiry or down-payment change was approved.

--- Prior checkpoints retained ---

# Fleet, navigation and current-name checkpoint — 8 November 2026

Fleet catalogue rows now pair photos with specifications, unit pricing, deposits and one Book now link to the existing rental selection form. Account/privacy, cart and checkout use the shared workspace; restricted accounts retain a limited menu. All64 page routes were audited for intentional public/workspace/print layouts. Current sample names use professional fictional labels without altering saved identities or credentials.

Verified466 unit/interface cases,16 isolated marketplace/tour cases, production build and sequential type checking;23 additional current-navigation checks plus26 shared-header,19 workspace and14 service-health checks. Actual1440desktop/375phone checks passed fleet columns/stacking, loaded photos,48px booking actions, target-form navigation, privacy sidebar, return links and no overflow. Source/layout audit is not a claim that all64 pages had every business action manually exercised. Scope and evidence: [navigation audit](navigation-route-audit.md), [current names](current-display-names.md).

Primary has001–041 plus independent045. Test has001–045. Twenty scoped current records were renamed with private before-image/audit and98 history/financial table fingerprints unchanged. The expiry worker had stopped after connection failures; a fresh leased instance was started and its successful batch verified. No duplicate worker, new booking/consent, payment, refund, transfer, OCR or email dispatch was performed. PayMongo remains disabled and incomplete; public production readiness is not established. The [agent-assisted booking proposal](workflows/agent-assisted-booking-proposal.md) is research only, awaiting approval for workflow changes.

--- Prior checkpoints retained ---

# Local system acceptance — 8 November 2026

The approved local demonstration scope is feature-complete and its planned software verification is complete. This is an engineering acceptance record, not a claim of defect-free software, production certification or research participant findings. The refined manuscript governs the multi-agency workflows; GPS and geofencing remain excluded.

## Workflow coverage

| Area | Implemented path and evidence |
| --- | --- |
| Accounts and authority | Public registration, managed sign-in, verified email, separate code/password recovery, current-password rejection, current stored authority and tenant isolation. The user completed actual email verification and password-reset/sign-in checks. Reviewed privacy/access cases preserve necessary history; self-review and last-administrator protections have native/interface coverage. |
| Agency partnership | Saved applications, evidence, exact policy revisions, independent approval/corrections, effective-versus-draft defaults and separate approved agencies. Versioned platform terms and defaults preserve existing records. |
| Vehicles and tours | Owner consignment and agency-owned inventory, compliance, photos, exact agreements, availability, maintenance and driver calendars; group capacity and private-party tours; configurable driver fee units. Database overlap/concurrency and withdrawal/revision gates are covered. |
| Marketplace and booking | Search/filter/sort, date and party estimates, persistent agency-grouped cart, atomic request submission, private requirements, consented advisory OCR and separate human comparison, exact quotations/holds, electronic agreement and scoped histories. |
| Service and finance | Separate manual/simulated payment records, vehicle inspections/release/return, tour attendance/completion, cancellation, reviewed refunds, exact assessments/settlement, conserved allocations, owner withdrawal/payout, accepted post-close recovery, platform remittance and agency-accepted future credit. Approval/evidence never substitutes for the separately recorded payment result. |
| Reports and operations | Scoped Philippine-date statements and exact-centavo CSV, saved printable records, recipient inbox, protected email queue/recovery, worker lease/duplicate protection and current service health. Consistent database/Auth-record/object-byte recovery was exercised in an isolated target. |

## Automated and service evidence

- The final full unit/interface/route run passes 425 cases. The final interface corrections additionally pass all 10 existing navigation/settings cases, the production build and a subsequent TypeScript check.
- The broad native database run passed 226 of 228 cases initially. The other two hit their 20/30-second limits; both pass focused reruns at 18.98/33.45 seconds with explicit 60-second budgets. All 228 have passing per-case evidence across those runs, rather than a newly executed single green 228-case run. Later governance and settings have their separate native evidence and quotation/agreement regressions.
- The final production server passes 26 shared-navigation checks, 19 workspace checks and 14 service-health checks. The restricted runtime database connects successfully, the managed hold worker is running, and general notification email remains off.
- Read-only owner-ledger verification retains 476000 centavos earned, 100000 paid and 376000 available. The 50000-centavo unreviewed request remains queued. Original financial allocation records and policy publications were not rewritten during visual review.
- All five published cars and both published tours anonymously deliver decodable full-size JPEG photographs. Landing fleet images also load when scrolled into view; below-fold lazy loading is not treated as missing media.
- The isolated logical recovery matches 148 tables/2527 rows, including nine managed-auth tables, 51 retained object hashes and 1524 runtime permission entries. Two fixture placeholders are explicitly excluded from byte recovery while their metadata remains archived. See [recovery boundaries](workflows/backup-recovery.md).

## Interface and human checks

The final browser walkthrough used existing synthetic Super Admin, agency, renter and Cosigner accounts, plus the isolated privacy requester. Public pages and the new operational screens were inspected at 1440-pixel desktop and 375-pixel phone widths, with 820-pixel tablet coverage for public policies and audit. Checks covered readable long references, retained history, current navigation, phone menus, Escape/focus behavior, invalid-share error links and disabled review actions. No financial action, policy publication, account-access change, OCR request or email dispatch was needed for this walkthrough.

The walkthrough verified agency booking/resource handoffs, renter service next-step anchors and notifications, owner accounts and report filters, independent platform remittance review, accepted-credit saved records, requester/reviewer privacy history, user search/self-review protection, audit filtering, service health, public FAQs/terms and shared marketplace links. It produced three small corrections: wrapped policy/help actions have 12-pixel gaps; the account-count sentence works for one or many results; platform administrators see their operational links before personal booking/ownership groups.

The user separately checked the saved remittance receipt in Chrome's print preview and confirmed complete, readable content without clipped text or navigation menus. This is a human manual print check. The built-in browser did not independently complete the OS print-preview check, and no automated print result is claimed. Other saved-record screens were inspected on desktop/phone; this is not a claim that every record was printed in every browser.

Detailed screenshots, API results and the completed visual checklist are retained privately on the workstation. They include sample financial/access histories and are not published in this repository. Earlier STATUS.md notes describe the evidence available at their individual checkpoints; this acceptance record supersedes their then-pending final visual/recovery items.

## Deliberate boundaries

Live PayMongo transactions are deferred by the user. Current simulations stay explicitly labeled and transfer no money; manual records still require their actual evidence/review workflow. General notification-email dispatch needs explicit authorization before activation; prior SMTP self-delivery and actual account email/recovery checks passed. Internet remains necessary for the configured Neon/Auth/storage services.

Public deployment, live provider/Auth/storage cutover, standalone realtime chat, social login and optional voucher bonuses are outside the approved current delivery. Formal capstone participant/usability data and Chapter 4–5 findings must come from actual research after software completion. No such findings are fabricated here.
