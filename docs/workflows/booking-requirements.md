# Private booking requirements and human review

A checkout request starts at `REQUIREMENTS_PENDING`. The lead renter uploads an identity document; a driver license is additionally required when any line is self-drive. Tour-only and with-driver requests do not require the renter to hold a driver license. Each upload is private, limited to an 8 MB PDF, PNG or JPEG, and checked against the request's current owner, state and version before and after storage.

Submitting creates an immutable set of exact file references and moves the request to `UNDER_REVIEW`. An active operator of that agency reviews each submitted document. An operator cannot review their own request. Platform status alone grants no access to renter evidence. Documents uploaded as replacements remain invisible to the agency until submitted.

Every required document receives one immutable decision per submission. Corrections require a reason. Completing a review with any requested correction returns the request to `CHANGES_REQUESTED`; the renter may upload replacements and submit another preserved snapshot. All accepted decisions move the request to `READY_FOR_APPROVAL`. Rejection requires a reason and closes the request at `REJECTED`. Decisions, submission history, event messages and audit records remain available; accepted decisions cannot be silently changed.

License acceptance requires an expiry date covering the service's final Manila calendar date. An identity expiry is optional, but a supplied expiry must also cover the service. Stored calendar dates retain their exact value across server time zones. Read-only requirements responses use a consistent database snapshot so displayed versions and submitted documents agree.

The interface shows pending, submitted, returned, ready and rejected states, with protected downloads, labeled fields, reason feedback and a reload gate after a version conflict. Request queues display the actual status. Successful changes refresh the server-rendered history. Submission and final review outcomes create scoped notification records.

Human review is the operative verification method. This module does not claim OCR extraction or document-authenticity verification; the advisory OCR adapter remains a separate required integration. No vehicle, driver or tour seats are reserved, and no payable quotation or payment is created by document acceptance. The next module performs independent agency approval and transactional allocation.
