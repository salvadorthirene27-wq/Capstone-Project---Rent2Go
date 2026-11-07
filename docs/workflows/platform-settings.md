# Versioned platform settings

A current, active Super Admin publishes starting commission shares, marketplace terms, help answers and an internal evidence-review interval through `/admin/settings`. Ordinary agency, Cosigner and renter roles have no settings access. A provider session or client-supplied role never replaces the current stored authority.

## Publication and preserved records

Each publication requires the exact current version and digest, a review reason, explicit acknowledgment and an actor-bound retry key. The singleton publication lock serializes conflicting updates; the actor is checked again under a shared row lock. Exact retries do not publish twice, changed retry bodies and stale versions are rejected, and an unchanged payload does not create another version. Payloads, digests, reasons and publication commands are append-only. The protected audit feed records the publication reference and revision.

Starting consigned-car shares must have a positive Cosigner portion and total exactly 100%. New agency applications copy these defaults and retain their starting policy revision. Later publication does not replace a saved draft, an approved agency policy or a negotiated vehicle agreement. Agency-owned vehicle drafts derive their platform and maintenance portions from the approved agency policy, assigning the rest to the agency; tour-only publication derives the platform portion from that policy and assigns the rest to the agency. Existing vehicle/tour revisions and allocations remain unchanged. Driver fees remain part of rental revenue; refundable deposits remain separate.

Each newly issued quotation saves the current platform terms title, text, revision and digest. A database trigger checks the exact saved terms against that immutable policy revision. The renter sees the saved terms before accepting, and the new agreement copies those quotation terms before signing. Opening an older quotation or agreement never substitutes today's policy. Legacy records without the new optional terms field retain their original body and digest behavior. `/terms?revision=N` preserves public access to earlier terms; `/help` shows current published help content. Both public footers link to these pages without replacing the established landing design or shared navigation.

## Evidence review

A blank interval means manual scheduling. A configured positive number of days reports the count of old, unselected requirement uploads on completed, cancelled or rejected requests. A selected requirement file or a file referenced by any OCR command is excluded. This is a review criterion, not a legal retention duration, automatic purge job, permission to read private documents, or a data-erasure claim. Required agreement, financial, consent, selected evidence and active-request history remain retained. Reviewed account/privacy requests continue through their separate workflow.

## Verification boundaries

Migration041 is additive and preserves legacy rows with nullable source-revision columns. Six native database cases verify seeded integrity, current authority, restricted runtime grants, exact retries, stale/concurrent publications, authority loss while waiting, new versus saved application drafts, immutable history, exact quotation terms and non-destructive review scheduling. Domain/interface/route cases cover exact basis points, derived shares, legacy/new agreement bodies, fresh acknowledgment, error links, network retries, stale/denied UI states and Origin rejection. Actual managed-Auth checks cover four sample roles and public terms/help without publishing another app policy, changing financial data or dispatching email. Responsive/print inspection remains pending browser access; HTTP success does not establish visual correctness.
