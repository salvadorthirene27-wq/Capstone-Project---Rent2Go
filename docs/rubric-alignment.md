# E-commerce rubric alignment

User supplied the e-commerce evaluation rubric on 4 November 2026 as a guide. Rent2Go is a marketplace for rental services and tour packages; inventory is date/seat capacity rather than physical shipping stock. No score is claimed until evaluated.

| Rubric | Delivery requirement |
| --- | --- |
| User account management | Managed authentication, profile/recovery, server-owned role access and tenant isolation |
| Product browsing | Approved cars/tours/agencies, search, categories, filters, sorting, responsive details and availability |
| Shopping cart | Persistent date-specific booking cart with update/remove, estimated subtotal and feedback; group by agency; no reservation until allocation gate |
| Checkout/order processing | Validate services/dates/party and create scoped booking requests; document approval, accepted quote/agreement precede payment; booking confirmation and downloadable accepted quote/payment record |
| Payment management | Multiple manual/demo methods, safe evidence handling, statuses, decline/pending/retry; no simulated settlement represented as real |
| Order tracking | Booking status/timeline, history, notifications and refreshed updates; excludes GPS/location tracking |
| Admin/vendor management | Agency onboarding/review, vendor catalog/booking management, Super Admin governance and scoped analytics |
| Promos/vouchers (bonus) | Additional planned feature: agency-scoped code, validity, usage/eligibility/minimum rules, server-calculated discount, persisted quote snapshot and concurrency-safe redemption |

Cart and voucher enhancements do not bypass manuscript approval/payment gates. Mixed-agency carts create separate agency requests and financial records. Prices before agency quote acceptance are estimates. Existing green/mint visual identity remains binding. Agency onboarding remains the current first delivery.
