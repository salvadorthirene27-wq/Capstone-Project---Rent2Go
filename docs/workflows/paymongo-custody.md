# Central custody accounting and withdrawal protection

This module classifies the custodian from the original immutable collection channel. A current agency policy, merchant key change or disabled gateway flag cannot turn a PayMongo receipt into agency-held cash. Provider gross, fees and net remain distinct; their conservation is checked with integer centavos. Existing immutable receipts and allocation ledgers are the source, so no duplicate mutable cash ledger or new migration is introduced.

## Accounting review

The authorized agency booking page has a collapsed central-custody section only when verified provider funds exist. It shows receipt provenance, the agency-borne processing fee and, after exact reconciled financial closing, protected owner/maintenance/platform allocations and the agency share after fees. Its source references are available in a second disclosure. It offers no transfer action and does not treat provider net receipts as a bank settlement.

`GET /api/booking-requests/[id]/custody` is read-only, no-store and rate limited. Active actual agency operators and active nonfixture Super Admins can read it; the booking's renter and unrelated users cannot read private provider-fee information. Client financial totals and filters are rejected. Access is rechecked from stored identity and agency membership. An inactive agency's historical custody remains reviewable by the platform.

Before financial closing, receipts establish funds held, not distributable revenue; quoted deposits cannot be treated as earnings. After closing, a position is calculated only when every verified receipt is posted to its original collected source, all amounts conserve the exact closed allocations, and no unresolved gateway work, incompatible channel, unverified refund or later credit requires independent adjustment. Mismatch leaves the original gross/fee/net visible while withholding a spendable projection. Fee shortfalls remain an agency obligation; owner, maintenance and platform allocations are unchanged. The mathematical position is not authorization to execute a disbursement.

## Owner availability and commission

Cosigner account/detail, directory and current owner-report availability exclude net centrally held allocations. Earned amounts remain visible and immutable. A held amount alone does not create a Cosigner recovery debt. Credits reduce their own original allocation; centrally held and agency-held earnings cannot be double counted. Approval and successful payout recheck actual agency-held capacity, including all earlier approved reservations. A previous pending payout can still be resolved as failed/cancelled without a debit, after which its unpaid approval can be revoked; a successful outcome remains blocked if capacity is insufficient.

Centrally collected platform commission is excluded from ordinary agency remittance sources, balances and their shared report queries. Original platform revenue remains recognized; the agency is not charged a second time for commission Rent2Go already holds. Manual and earlier simulated agency-held records retain their original financial histories and source-based remittance workflow.

Current agency accounting headings use the agency's display name, with approved revision fallback. Historical document names, original withdrawals, receipts and agreements remain unchanged.

## Remaining execution boundary

All centrally collected owner allocations remain held until the separate reviewed agency-disbursement module records their exact release. This checkpoint does not execute or record an actual agency transfer, agency top-up, provider refund or post-refund central adjustment. Provider refunds, retained-deposit disposition, actual agency disbursement evidence, accepted later recoveries and customer checkout must be connected and accepted before gateway activation. Current payment and general email flags remain off.

## Checkpoint evidence — 9 November 2026

507 unit/interface cases pass, plus10 focused UI/API checks after the final display-name correction. Native custody8 and existing accounting26 pass (34 distinct cases); the final15-case custody/withdrawal run repeats the seven withdrawal cases. Native fixtures use synthetic provider responses and explicitly constructed immutable accounting rows; they do not claim a new provider-paid or complete settlement-acceptance walkthrough. Existing settlement acceptance has its own earlier evidence. The first custody run exposed conflicting integer/bigint types in the test fixture; casts were fixed, followed by the full passing rerun.

Production build, sequential TypeScript, four-role custody16/header26/workspace19/health14 HTTP checks pass. Actual desktop/phone sample-owner checks show a zero held balance, current agency name and conserved earlier earnings/payouts; populated custody states remain native/component evidence. Fingerprints of98 original primary history/financial tables are unchanged. No migration, external transfer, provider payment/refund or email was performed. Transient connection resets stopped the prior hold-expiry worker; a replacement and successful batch are verified, without claiming a network root cause was fixed.
