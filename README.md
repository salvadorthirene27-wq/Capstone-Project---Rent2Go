# Rent2Go

A multi-agency car rental and tour marketplace for a capstone project. Rent2Go supports agency onboarding and approval, vehicle consignment and compliance, rental and group/private-tour catalogs, availability-aware search, cart and booking requests, private document review, quotations, agreements, manual and simulated payments, service fulfillment, financial assessment and settlement, owner withdrawals, separately accepted closed-booking credits and earnings recovery, platform remittances and accepted agency credits, reports, notifications, advisory OCR, and account security. See [implementation status and remaining work](docs/STATUS.md), [approved design](docs/superpowers/specs/2026-11-04-rent2go-design.md), and [rubric mapping](docs/rubric-alignment.md).

GPS/geofencing is outside this project's scope. The old repository, database and environment file are not used. No adoption figures or usability results are claimed.

## Run locally

Requires Node.js 24.14+ and npm. The app runs at `http://localhost:3100`. Internet is required for Neon Auth, PostgreSQL and the configured S3 storage.

1. `npm ci`
2. Create `.env.local` from `.env.example` and fill it with credentials for the designated **new** Neon project. Never commit this file.
3. `npm run db:migrate`
4. `npx tsx --env-file=.env.local scripts/setup-local.ts` configures the restricted runtime role and isolated test database, keeping secrets in `.env.local`.
5. `npm run db:migrate -- --test`
6. `npm run dev`, or `npm run build` followed by `npm start` for a production-mode local demo.

On this workstation the new environment is already configured. Start with step 6. Do not replace its credentials with the old supplied environment file.

Migration/setup tools intentionally allow only the new project/endpoint and explicitly named `rent2go` / `rent2go_test` databases. Provisioning a different project requires reviewing and updating those target guards. `DATABASE_URL` is the restricted runtime connection; `MIGRATION_DATABASE_URL` is the owner connection. Automated tests use only `TEST_DATABASE_URL`.

## Platform settings and public policies

An active Super Admin manages `/admin/settings`. Published starting shares apply to new agency drafts; approved agency policies supply new vehicle/tour defaults. New quotations and agreements preserve their exact platform terms version. Existing drafts and financial records retain their saved values. `/terms` and `/help` are public; evidence-review scheduling never deletes private files automatically. See [the settings workflow](docs/workflows/platform-settings.md).

## Accounts and agency workflow

Register through `/login`, then open `/workspace`. Public registration never grants administrative access. The application can be saved before completion. Submission requires configured policies, rates, a 100% revenue allocation and registration evidence; manual GCash additionally requires its business-owned QR.

For a controlled Super Admin, sign in with an intentionally selected account, open its workspace so the server records the identity, then run `npm run admin:bootstrap -- EXACT_AUTH_USER_ID`. This is a local operator command, not a public endpoint. `/api/me` shows the signed-in identity's ID to that user.

Super Admin reviews `/admin`, requests corrections or approves/rejects a specific submitted revision. Approval creates agency access. Further policy changes go through **Revise agency policies** and another review; the previous approved version remains effective until a replacement is approved. Earlier submitted data and evidence remain immutable. Withdrawn/rejected first applications can be revised and resubmitted.

Synthetic demonstration accounts created during local verification live in ignored `local-accounts.json` on this workstation. They are not committed. Never use real identity documents or real payment credentials for the demo.

## Private evidence and payments

The current deployment uses a private Neon S3-compatible bucket. `STORAGE_DRIVER=s3` uses the branch-specific `AWS_*` environment values. Explicit `STORAGE_DRIVER=local` is available for a local filesystem fallback outside public assets; an unset or invalid driver is rejected. Each file remembers its backend. Files are delivered through authenticated, audited download routes.

Uploads support PDF/PNG/JPEG, signature/type checks and an 8 MB limit. Document acceptance is an administrator's review; upload validation does not establish authenticity or perform malware scanning.

Current application forms collect manual cash/GCash and demo card/GCash/PayPal preferences. **They do not yet execute a gateway transaction.** Simulated payment, refund, payout and remittance records stay visibly separate from manual external-payment records. Manual proof is a claim until the applicable independent review confirms it. PayMongo integration remains deferred; no live gateway charge is claimed.

## Checks

```text
npm test
npm run test:integration
npm run typecheck
npm run build
npm audit --omit=dev
```

Integration tests create synthetic records in the isolated test database and do not reset any old or unspecified database. The application uses managed Neon Auth; the password-recovery interface uses its email OTP methods, but actual email delivery must be verified separately with an authorized address. Formal usability evaluation remains human research work after approved instruments and actual testing.

On Windows, the build command loads a process-scoped fallback for asynchronous directory-creation `EPERM` errors in this desktop sandbox. It retries the same operation synchronously with identical options and OS permissions; genuine permission errors remain errors. It is not loaded by the running application. No old project source is used.

## Scope and financial policies

Default consigned shares are Cosigner 70%, agency 10%, Rent2Go 10%, vehicle maintenance 10%. Agency-owned cars use agency 80%, Rent2Go 10%, maintenance 10%; tour-only uses agency 90% and Rent2Go 10%. These defaults are configurable by agreement. The agency holds maintenance allocations separately for the vehicle. Refundable deposits are not service revenue. Financial posting uses exact accepted settlements and conserved immutable allocations. Owner withdrawals/payouts and platform remittances are recorded separately; approval, a reservation, or an upload alone is not proof of payment. Later credits preserve the original financial records and require the affected parties’ exact acceptance. See [platform remittance workflow](docs/workflows/platform-remittances.md).

The interface complements the original develop version's forest green/mint branding with newly implemented source. See [product context](PRODUCT.md) and [design reference](DESIGN.md).

## Quotation expiry

While running a local demonstration, launch `npx tsx --env-file=.env.local scripts/expire-booking-holds.ts --enable` in a separate terminal. Stop any earlier unmanaged launcher first. The managed launcher refuses duplicate instances; `--once` performs one bounded pass. Stop the worker when the demonstration ends. Super Admin can inspect `/admin/operations` for recent contact, successful batches and backlog. See [service-health workflow](docs/workflows/service-health.md). This does not enable notification email sending.

## Account and privacy review

Account holders can open `/account-status` to request account information, an exact display-name correction, privacy removal review, deactivation or reactivation. Requests require independent Super Admin review at `/admin/privacy`; necessary financial/booking/consent history is retained. Existing obligations must be resolved before voluntary deactivation. Disabled users retain only their own status/review portal. Super Admin user-access and limited audit views are at `/admin/users` and `/admin/audit`. See [account/privacy workflow](docs/workflows/account-privacy-governance.md). These features do not claim immediate erasure or deletion of the managed authentication account.
