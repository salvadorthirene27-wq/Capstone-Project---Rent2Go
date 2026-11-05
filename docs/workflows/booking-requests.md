# Grouped booking requests

Signed-in users review their current cart and contact information at `/checkout`. The submission contains only selected cart item IDs/versions, reviewed digests, the cart version, contact name/phone/notes, and a client-generated idempotency key. The account email, agency, prices, terms and financial categories are server-derived.

One transaction locks the permanent owner cart, checks an actor-scoped prior command, verifies current cart/item versions, locks all selected sources and agencies using the cart lock order, and reprices every selection on the same transaction connection. A stale or unavailable item rejects the whole command. No partial request remains and the cart is retained.

Success creates one request per agency with immutable public estimates, listing details, policy and private financial snapshots. A line's agency must match its request through a composite foreign key. An item may be submitted once. Events and checkout results are immutable. Consigned, agency-owned and tour-only allocations retain their agreed categories, while refundable deposits remain separate. The later accepted quotation applies agreed shares to rental service revenue including the driver fee, as explicitly confirmed by the user; no financial posting occurs at request submission.

Submitted items are soft-removed; other selections remain. The key/hash/result is stored atomically. The same command returns the same request IDs after cart clearing, including concurrent retries. A different command with the same key returns a conflict. The client preserves the key and contact fields after a lost response and links to existing request history.

Renter-owned and agency-scoped lists/details omit private allocations. Agency users require current operating access. Super Admin status alone grants no foreign-contact access; explicit platform governance remains a later feature. Agency routes check both the agency context and request agency. A user may rent from their own agency, but the interface states that an independent operator must review that request when review actions are introduced.

Requests start at requirements pending. No reservation, accepted quotation, signature, payment, invoice, earnings or resource allocation is implied. In-app notification records are inserted for the renter and authorized agency recipients; external delivery is not claimed. Requirement upload/review and reservation approval are the next modules.
