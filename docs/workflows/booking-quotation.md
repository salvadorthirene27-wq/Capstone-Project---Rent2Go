# Agency approval, inventory holds and dated quotations

Only a request with completed human document review may enter approval. An independent active agency operator chooses a driver for each with-driver rental and issues one quotation for all request lines. The server checks the original published listing and agency-policy revisions, future service dates, tour booking cutoffs, guest limits, current actors and membership, resource availability and turnaround buffers. Changed terms require a new request; they never overwrite the submitted snapshots.

Approval, quotation and all allocations succeed in one transaction. Vehicle and driver intervals use the existing PostgreSQL exclusion constraint. Locked group departures reserve the party's seats; private departures reserve one exclusive slot while enforcing party size. Any conflicting line rolls back the quotation and every allocation. Quotation versions retain public prices, separate refundable deposits, agency and listing policies, assigned driver names and a canonical digest. Private consignment clauses and financial allocations remain outside renter responses.

The deadline is the earliest of the saved agency hold period, service start and applicable tour cutoff. The renter accepts or declines the exact current quotation ID and digest. Acceptance does not extend the hold or establish a signed agreement, payment or confirmed service. Decline releases all linked resources and seats. An agency may withdraw a pending quotation with a reason, release the hold, and issue a new preserved version. Accepted quotations use later cancellation procedures.

Issuance, expiry and acceptance share the PostgreSQL clock. Responses include the current server time; the browser advances it using a monotonic clock for expiry feedback. An incorrect laptop or browser wall clock therefore cannot shorten a newly issued hold or hide a valid quotation. Existing quotation timestamps remain immutable.

The guarded local expiry worker checks every15seconds. It releases expired pending or accepted holds once, preserves claims and quotation history, records an explicit automatic system actor and sets `HOLD_EXPIRED`. Availability remains conservative until cleanup. New allocation attempts also perform bounded cleanup, and an expired quotation cannot be accepted while waiting for the worker. Reads never mutate the workflow.

Mutation locks follow request, source listings, agency, sorted relevant actors, membership, hold, resources and schedules. Actor and membership checks repeat after waiting for those locks. Expiry handles one request per transaction, avoiding a batch-wide inversion of resource order.

Run the server with `npm run start` and the expiry worker in a second terminal with `npm run booking:expire-holds`. Both use the ignored local configuration. The worker refuses an unexpected project, host or database; isolated test use requires an explicit `--test` argument. It does not use the old supplied database.

Rental allocation snapshots apply agreed percentages to the entire service revenue including driver fees, as confirmed by the user. Refundable deposits remain separate. This module creates no earnings or money movement; reconciliation and settlement occur later.

The current launcher also coordinates a single managed instance through a database-clock lease and retains successful/failed batch observations. Super Admin can review `/admin/operations`; see [service health](service-health.md). A failed batch may have completed some booking transactions, so its overall release count is unavailable; retries preserve the original idempotent expiry protections.
