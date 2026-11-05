# Reviewed refunds and payment records

Authority: approved manuscript/design refund workflow. A request, an approved reservation and a paid refund are separate immutable facts. This module does not infer cancellation fees, deposit deductions, tax, extra-charge allocations, earned service revenue or final financial completion.

## Original funds and review

The renter requests an explicit integer PHP-centavo amount against one original confirmed collection, with a reason. The exact original quotation/service cancellation, refund and deposit policies are preserved with the request and digest. Eligible cases are approved cancellation reconciliation, physically finished service reconciliation and historical payment reconciliation. This is not an active-rental early-return shortcut.

An independent active agency operator reviews the exact request/digest, approving the exact amount or rejecting with a reason. Approval reserves capacity; it does not record payment. Requesting alone does not reserve money. Pending requests may be withdrawn by their renter. An agency may revoke an unpaid authorization with a reason, releasing its reservation once. Executed refunds cannot be revoked or edited; later errors require a separate compensating case.

Refund capacity is original confirmed collection minus previously executed refunds and approved unpaid reservations. All historical rows count, regardless of visible history page. Shared request/authority locks serialize concurrent approvals. A stale version or changed remaining amount requires reload/review; two approvals cannot spend the same balance. Capacity is an upper bound, not a policy promise of entitlement.

## Manual execution

An independent operator records an externally paid refund only against a current approved manual authorization. The amount is derived from the immutable authorization; the client cannot substitute amount or environment. The operator declares external execution to the original renter, supplies method/reference/note and private PNG/JPEG/PDF proof. The server checks authority before storage and again before attaching metadata and recording payment. Stale, denied and unused retry uploads clean up their orphan object.

Outgoing manual references are claimed uniquely within agency/method scope. A repeated provider/cash reference cannot pay another refund. Exact retries bind command and content hash and return saved state without a second payment. This records agency-entered external execution evidence; Rent2Go does not transfer funds or independently certify a provider transaction.

## Demo execution

Demo source collections permit only labeled fixed simulations of approved, declined, pending or cancelled outcomes, using the source's demo method. Pending results require exact resolution; another attempt cannot skip an outstanding result. Only confirmed simulation creates a demo refund-payment record. Manual evidence cannot convert demo funds. Revoking an unpaid authorization prevents later execution, including its earlier pending simulation. No card, wallet or banking credentials are collected.

## Scope, history and final accounting

Only the renter and active independent operators of that booking agency access its private records/proof. Super Admin/Cosigner roles do not bypass this boundary. Download headers prevent public caching/sniffing and private files use opaque keys. Participant-only printable payment records retain the original collection reference, amount, recipient, execution reference and persistent demo identity. An approval has no printable paid record.

Original collections and closed refund history are separately paginated. Up to20 open refunds remain visible independently of history pages; additional requests require resolving existing open work. Attempt display is bounded, while pending-result detection checks the complete history. No source refund is hidden merely because it is older than the first page.

Refund execution preserves original collection, deposit, credit, signature and inventory records. It neither releases resources nor posts earnings or completes a booking. The following itemized assessment/financial reconciliation must account for already executed refunds and outstanding reservations before final deposit/charges/balance disposition. The user approved agency-configured allocations per extra-charge type with exact renter acceptance; that configuration is a separate following module.

## Observed verification

209 unit/interface/route/receipt checks, TypeScript and production build pass. Seven distinct refund database cases pass across the six-case regression successes and corrected focused pagination case; all8 cancellation regressions pass. Checks cover exact approval/retries, concurrent capacity, revocation/withdrawal, immutable/runtime privileges, manual/demo separation, stale post-storage eligibility, outgoing reference reuse and older source/history pages. A bulk-fixture PostgreSQL UUID/text parameter mismatch was corrected; no production calculation was changed for that fixture failure.

49 production HTTP checks pass across four synthetic managed-Auth accounts and private S3. They cover reviewed manual evidence/byte equality, protected print records, explicit demo failure/pending/resolution, field/origin/role denial, no paid rewrite and unchanged original deposits/credit. Synthetic manual evidence explicitly states no actual funds moved. Authenticated browser layout, OS print dialog, full Auth/object-storage restore and human usability remain unverified.
