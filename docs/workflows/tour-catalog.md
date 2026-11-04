# Tour catalog workflow

This describes implemented catalog behavior. Booking approval, payments, attendance and service completion are subsequent modules, not outcomes of publication.

An active operator of an approved agency creates a complete package draft. Its model must be included in the agency's effective approved services. A pending agency amendment does not grant a service. Public registration and the Super Admin role alone do not grant operational access to another agency.

The draft declares itinerary, meeting point, service area, inclusions/exclusions, guest requirements, party limits, price and terms. `GROUP` means a price for each guest; `PRIVATE` means one price for the whole party. Operator transport is an itinerary inclusion; this feature sells a tour-only service, not a separately rented customer vehicle.

Draft photos are private to authorized agency operators. Publication requires a current photo and saves immutable package facts, photo references, agency policy revision and revenue shares. Tour-only agency/platform shares derive from the approved policy's platform percentage: the default is agency90% / Rent2Go10%. No Cosigner or maintenance share is charged on a tour-only service.

The agency adds available dates after publication. Each schedule is bound to that publication revision, with explicit start/end, cutoff and capacity. Times are entered/displayed in Manila and stored as instants. Cutoff must be in the future and precede departure. Group capacity is total seats; a booking's party remains within the package limits. Private capacity is the maximum guests in one exclusive party. Overlapping private slots for the same package are rejected by PostgreSQL, including concurrent writes; adjacent half-open intervals are allowed. Distinct group departures may overlap.

Withdraw a package before editing. Withdrawal hides it and its photos from new public browsing without deleting history. A published pricing model cannot be changed into the other model; create a separate package. Republish edits to create a new immutable revision. Old schedules retain their original revision and do not inherit revised pricing or policies; new public dates use the new revision.

Operators can cancel unallocated dates with a reason. Cancellation is retained in paginated history and cannot be repeated. Allocated departures cannot be cancelled or deleted through the catalog. Future booking cancellation/refund operations must resolve affected obligations before the schedule can be cancelled. Schedule facts cannot be silently moved or resized; cancel an eligible date and create a replacement.

Current public search supports keyword/service area, model, guest count with available capacity, unit-price sorting and pagination. Full rental search, date filters, recommendations and the booking cart follow in the marketplace/booking tasks. Availability shown by catalog reads is provisional; booking approval must lock and recheck capacity transactionally.

Local checks use synthetic accounts, packages and files. They are development evidence, not formal usability findings or actual tours for sale. Browser visual/responsive inspection remains pending after browser automation could not verify the current URL safely.
