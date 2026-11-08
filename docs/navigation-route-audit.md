# Navigation route audit — 8 November 2026

Source audit of all64 page routes below. This is a route/layout audit, not a claim that every business action has been manually exercised. Shared Header lives in the root layout. All operational account/agency/admin/owner pages use Workspace directly or the financial report wrapper. Cart, checkout and the two account/privacy routes now use that same layout. Active privacy users receive normal navigation after a fresh identity check; restricted users retain only their account-request and marketplace navigation. Server authorization remains authoritative.

Public discovery/help/terms pages intentionally use marketplace navigation without a role sidebar. Sign-in and saved printable documents intentionally use compact brand/back navigation. Print styles suppress site chrome. The former credits URL redirects home. No new booking confirmation, payment or callback behavior is introduced.

The installed UI/UX Pro Max search verified predictable back navigation and visible keyboard navigation as relevant guidance. Desktop and mobile checks use the existing forest/mint theme, ordinary links and history, labelled menus, Escape/focus restoration and44px minimum action targets. Tests of every role’s changed pages supplement the source audit; protected saved-document layouts keep their existing access controls.

| Route | Layout |
| --- | --- |
| `/account-status` | Shared workspace |
| `/account-status/privacy/[id]` | Shared workspace |
| `/admin/applications/[id]` | Shared workspace |
| `/admin/audit` | Shared workspace |
| `/admin/operations` | Shared workspace |
| `/admin` | Shared workspace |
| `/admin/privacy/[id]` | Shared workspace |
| `/admin/privacy` | Shared workspace |
| `/admin/remittances/[agencyId]` | Shared workspace |
| `/admin/remittances` | Shared workspace |
| `/admin/reports` | Shared workspace |
| `/admin/settings` | Shared workspace |
| `/admin/users/[id]` | Shared workspace |
| `/admin/users` | Shared workspace |
| `/admin/vehicles` | Shared workspace |
| `/agencies/[id]` | Public marketplace |
| `/agencies` | Public marketplace |
| `/agency/[id]/accounting/[ownerId]` | Shared workspace |
| `/agency/[id]/accounting` | Shared workspace |
| `/agency/[id]/bookings/[requestId]` | Shared workspace |
| `/agency/[id]/bookings` | Shared workspace |
| `/agency/[id]` | Shared workspace |
| `/agency/[id]/remittances` | Shared workspace |
| `/agency/[id]/reports` | Shared workspace |
| `/agency/[id]/resources/drivers/new` | Shared workspace |
| `/agency/[id]/resources` | Shared workspace |
| `/agency/[id]/tours/[tourId]` | Shared workspace |
| `/agency/[id]/tours/new` | Shared workspace |
| `/agency/[id]/tours` | Shared workspace |
| `/agency/[id]/vehicles/new` | Shared workspace |
| `/agency/[id]/vehicles` | Shared workspace |
| `/booking-agreements/[id]` | Compact document/auth |
| `/booking-inspections/[id]` | Compact document/auth |
| `/booking-payments/[id]` | Compact document/auth |
| `/booking-refunds/[id]` | Compact document/auth |
| `/cars/[id]` | Public marketplace |
| `/cart` | Shared workspace |
| `/checkout` | Shared workspace |
| `/closed-credits/[id]` | Shared workspace |
| `/help` | Public marketplace |
| `/login` | Compact document/auth |
| `/owner-payouts/[id]` | Compact document/auth |
| `/` | Public marketplace |
| `/partners` | Public marketplace |
| `/photo-credits` | Redirect |
| `/platform-records/[kind]/[id]` | Compact document/auth |
| `/rentals` | Public marketplace |
| `/terms` | Public marketplace |
| `/tours/[id]` | Public marketplace |
| `/tours` | Public marketplace |
| `/workspace/account` | Shared workspace |
| `/workspace/application` | Shared workspace |
| `/workspace/bookings/[id]` | Shared workspace |
| `/workspace/bookings` | Shared workspace |
| `/workspace/earnings/[agencyId]` | Shared workspace |
| `/workspace/earnings` | Shared workspace |
| `/workspace/notifications` | Shared workspace |
| `/workspace` | Shared workspace |
| `/workspace/reports` | Shared workspace |
| `/workspace/resources/[id]` | Shared workspace |
| `/workspace/resources` | Shared workspace |
| `/workspace/vehicles/[id]` | Shared workspace |
| `/workspace/vehicles/new` | Shared workspace |
| `/workspace/vehicles` | Shared workspace |
