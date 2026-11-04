# Marketplace search and pricing

Only current published vehicle/tour revisions from active approved agencies are public. Pending agency amendments do not grant services. Vehicle owner suspension, withdrawal or inactive resources remove the corresponding eligibility. Projections omit personal ownership evidence, registration identifiers, revenue shares, settlement details and private driver contacts/licenses.

Rental search accepts keyword, service area, agency, rental mode, party size, transmission, fuel/body type, billing unit, rate ceiling, dates, preferred service budget and transmission preference. Driver-provided service reserves a seat outside the renter's party. Without dates, the page explicitly asks the renter to choose dates before treating availability as checked.

Vehicle date checks exclude active occupation overlaps through the agency's configured post-return turnaround interval. With-driver searches additionally require an active licensed driver, valid through the service, without an overlapping claim. The public result discloses eligibility, not the driver's identity. Final booking approval will lock and recheck these shared resources; search itself never reserves them.

Agency driver-fee units are explicit and versioned. Per24-hour/hour units round elapsed duration upward; Manila calendar days count the local dates touched by the half-open interval, so a return exactly at midnight does not add the next calendar day. A per-booking driver fee is charged once; a per-vehicle-billing-unit fee follows that vehicle's billing count. A missing legacy unit is not guessed.

The rental estimate displays vehicle charges, driver charges and refundable deposit separately. The displayed service budget comparison excludes the refundable deposit. Monetary inputs and totals are integer centavos; supported quotation totals are limited to100,000,000 centavos. A quote/agreement, rather than browsing, defines the final accepted amount.

Recommended rental order first preserves eligibility, then prioritizes service-budget fit, transmission preference and lower service estimate. When dates are absent, the listed unit rate is the price ordering basis and is labeled accordingly. Hard filters and sorting run before database pagination; changing result pages preserves the filters. No popularity, demand model or review score is invented.

Tour search filters agency, departure dates in Manila, model and guest count against a real available schedule. GROUP estimates multiply the unit rate by guests; PRIVATE estimates charge once per party. Budget recommendations use whole-party amounts. Public detail dates are filtered and paginated, retaining guest/date criteria from search. Unsupported totals show a correction message while preserving the usable package page.

All availability is provisional. Cart/request checkout, document review, resource allocation, accepted quotations/agreements, payments and fulfillment follow as separate workflows. No payment or reservation is created by a search or catalog publication. GPS/geofencing remains excluded.
