# Exact electronic agreement implementation plan

> For agentic workers: use superpowers:subagent-driven-development with the fixed local contract and independent review after integration.

Goal: preserve the accepted quotation in an agency-issued agreement and record the renter's exact electronic consent with private signature evidence before payment.

Architecture: immutable agreement revisions, body/digest/template snapshots and signature metadata in PostgreSQL; private image storage; existing Auth, ordered participant locks and expiring quote holds. Issuance/signing use the PostgreSQL clock. No new document-generation dependency; the parent may add a protected printable HTML view after the core contract is verified.

Spec: approved refined manuscript sequence and PRODUCT.md. Existing quote prices/policies/deposits cannot change through an agreement; signing does not extend inventory holds or create money movement. No Super Admin/private record bypass, self-review or GPS.

- [x] Backend: migration017, agreement schema/service, strict APIs and private signature reads. Reuse the current quotation authority lock order, extend hold expiry to agreement states and observe failing-then-passing domain/database tests.
- [x] UI: exact agreement body and history in both request pages, typed signer name, signature drawing/upload fallback, explicit consent, privacy/expiry/busy/conflict states; focused failing-then-passing interface checks.
- [x] Parent integration: isolated migration, runtime grants, queue/requirements labels, participant-protected printable view, real storage/HTTP checks and appropriate existing workflow regressions.
- [x] Resolve bounded review findings; verify build/tests, checkpoint source/database, push and verify GitHub. Continue manual/demo payment implementation afterward.
