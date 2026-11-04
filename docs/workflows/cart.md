# Cart and reviewed estimates

A public visitor can browse vehicles and departures. Account creation is available on `/login`; every new account starts as a renter. A signed-in user chooses rental dates/mode/guests or a tour departure/guests, requests a server estimate, reviews current listing and agency terms, then adds the exact reviewed selection.

One persistent cart belongs to one actor. Public reads create no cart. Carts hold at most 20 services and group them by the source's actual agency. A car interval or tour slot is one selection; changing guests edits that item instead of adding another inventory quantity. Retry of an identical add returns the same item. Canonical quote hashing survives PostgreSQL JSONB key ordering.

All prices, published revisions, agency identity, fee units and deposits come from server sources. A digest confirms the estimate the user reviewed; the server rechecks it under source and agency locks. Client prices, shares and agency overrides are rejected. Group tours charge per guest; private tours charge once per party. Refundable deposits appear separately.

Opening the cart reprices it without changing saved estimates. Each line is current, changed, or unavailable. Changed publication or policy revisions require an explicit updated preview and save. Missing/withdrawn listings, past pickup, conflicting blocks, unavailable drivers, capacity/cutoff changes and cancelled dates preserve the saved selection with a recovery message. Item versions reject competing updates and removals. Access is owner-scoped, including for Super Admins.

Mutations serialize on the cart row. Sources are locked in vehicle-then-tour ID order, then all agencies in ID order, before agency operating context locks actors/members. Queries reuse the same PostgreSQL transaction client rather than acquiring a nested pool connection. Ordinary availability checks remain advisory.

No vehicle occupation, tour seat allocation, booking, quote hold, payment, commission, deposit reconciliation or earnings is created by cart operations. Grouped booking request checkout is the next workflow; until implemented the interface explicitly describes saved selections and provides no payment or fake confirmation control.

The global sticky navigation provides Home, Rentals, Tours, Agencies, Cart, Partnership and authenticated Workspace links; the current section remains indicated on detail pages. Its count endpoint reads only the owner's active item count, without repricing the whole basket. Narrow screens use a scrollable menu; Escape closes it and restores toggle focus. Workspace links indicate the active subsection.

The explicit local setup flag `LOCAL_DEMO_LOOPBACK_ALIASES=true` permits localhost and 127.0.0.1 with the same configured scheme and port. It does not permit other ports, HTTPS/HTTP changes, arbitrary hosts or wildcard origins. Hosted origins remain strict. Use a consistent host within a session because browser cookies are host-specific.
