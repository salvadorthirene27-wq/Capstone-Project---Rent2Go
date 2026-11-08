# Agency contact and follow-up workflow

The optional internal contact log extends an existing agency-specific booking request. It records agency staff assignments, a next follow-up time, and actual phone/email attempts with their outcomes and notes. It does not send calls or emails, create a reservation, accept a quotation, change requirements decisions or move money.

## Access and stages

Only an active, independent operator of the request’s actual agency may read or save contact records. The requester cannot review their own request, even if they also operate the agency. An unrelated Super Admin, Cosigner or agency operator has no access. Assignment choices come from actual active agency ownership/membership, exclude the requester, and reject suspended or fixture accounts. Staff membership and account availability are checked again under locks when saving.

The log can be updated before the first quotation while the request is Requirements pending, Changes requested, Under review or Ready for approval. Pending cancellation pauses updates. Quotation issuance, cancellation, rejection and later service stages leave the original history readable to authorized agency operators, with no further contact edits. A phone outcome such as Not proceeding is a contact note; cancellation still uses the separate reviewed workflow. Portal quotation acceptance, agreement signing, verified payment and handover remain unchanged.

## Agency procedure

1. Open Agency booking requests and select the request. The contact section shares the existing workspace layout.
2. Expand Update assignment or record contact. Choose Assignment / follow-up plan to assign active staff, set an optional future Manila time and add a relevant internal note. Unassigned plans are allowed.
3. After an actual contact attempt, select Contact attempt already made and record its method, outcome, time, assignment, note and optional next follow-up. A small server-clock tolerance is allowed for contact timestamps; clearly future attempts are rejected. Recording an email is not sending an email.
4. Review the saved assignment and time. The scheduled follow-up list orders open pre-quotation plans by time, marks overdue items and links back to the exact contact section. Closed/quoted requests and requests with pending cancellation are excluded from this active queue.
5. Expand Contact history for the saved records. History and scheduled follow-ups have bounded pagination. Paging either list preserves the other list’s selected page.

The form and history are initially collapsed. Date fields use Manila time and retain native input edits when another field renders. A save with uncertain delivery retains the same command and retry key and prevents changes until the operator retries or reloads and checks history. A version conflict requires a reload. Internal notes must omit passwords, verification codes and document identifiers.

## Data integrity

Migration047 is independent of gateway migrations. It adds current contact state, immutable command records and immutable history events. Each command is bound to its actor, request, exact normalized payload and idempotency key. Contact state has its own version; it never increments booking status/version. The booking lock serializes changes against quotation/cancellation operations. Exact retries do not append duplicates, including after quotation issuance; different content with a reused key fails. Historical actor/assignee names and notes remain saved as recorded. Notes are excluded from renter booking data, shared booking history, notifications and audit metadata.

No changes to existing quotations, agreements, payments, revenue allocations or account credentials are required. Migration047 is applied separately to the application schema while gateway migrations042–044 and046 remain deferred. The isolated database includes001–047. Source and database checkpoints preserve the previous records; private connection strings, account passwords, before-images and operational test evidence stay outside Git.

## Validation scope

Native checks exercise agency isolation, independent review, revoked/suspended/fixture staff, exact retries, concurrent versions, quotation locking, cancellation pauses, inactive agencies, scheduled queues, pagination, immutable history and complete writes with the restricted runtime role. Interface/API checks cover native date-event retention, compact forms/history, safe retry and stale-data behavior, private-data clearing, origin/authentication/cache/filter guards and links between the two paginated queues. Build, type checking, four-role HTTP and desktop/mobile browser checks supplement these cases; see STATUS.md for final counts and outcomes. These checks are software validation, not capstone respondent evaluation or evidence that a customer was contacted.
