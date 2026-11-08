# Booking and finance action audit

The user requested fewer cramped buttons while PayMongo integration continues. Keep the existing forest/mint design and distinguish a primary workflow decision from navigation, refresh and saved history.

## Applied

The shared renter/agency booking journey previously placed nine separate section links directly below its primary next-step action. Those links now live in one native **All booking sections** disclosure. The main next-step action remains visible. Expanding the control reveals all nine original destinations; none of the workflow steps or review permissions changed. This reduces the initial secondary navigation controls from nine to one and works without client JavaScript.

Desktop and 375-pixel phone review confirms collapsed links are actually hidden, Enter opens/closes the disclosure, all nine links remain reachable and the Refunds link reaches the real refund section. Expanded phone links retain 44-pixel targets and no document overflow. Both renter and agency booking pages use the same component. The existing unit cases plus one disclosure interaction case pass; production build and subsequent TypeScript pass. JSDOM does not implement native closed-details visibility, so that property was verified in the actual browser rather than inferred from its DOM queries.

UI/UX Pro Max's general keyboard, focus, spacing and touch-target priorities guide this change. Its two targeted searches did not provide a verified specific recommendation for this disclosure; the native disclosure choice is product judgment, not an attributed search result. No generated palette or typography replaces DESIGN.md.

## Next patterns to consolidate

| Pattern | Intended change | Required behavior |
| --- | --- | --- |
| Local online payment method and outcome selectors | One hosted PayMongo checkout action with clear returned/pending/paid status | Finish verified provider posting, custody, expiry and refund handling first. A return URL never establishes payment. |
| Repeated per-section reload buttons across one booking | Coordinate a booking-level refresh and retain localized recovery when a section fails | Preserve unsaved form/file selections; avoid redundant requests and stale-version actions. Do not replace a single useful control with an extra Options menu merely to change its appearance. |
| Repeated finance environment/filter controls | Reuse one consistent filter/action pattern across scoped statements | Preserve the explicit separation of actual/manual, archived simulated and PayMongo test records; retain date and agency context. |
| Multiple links for a saved request, receipt and credit | Group related saved-record actions in their context when several exist | Keep receipt versus request versus credit labels explicit. A request or approval is not a payment receipt. |
| Long completed agreement/history sections | Present historical material as readable disclosures with direct saved-document links | Keep exact terms available before consent; avoid hiding the current decision or a review reason. |

Financial approval, consent, payment, refund and disbursement actions remain distinct decisions. Global marketplace navigation and role-specific workspaces serve different destinations; share components without flattening those contexts. The remaining patterns are tracked work, not a claim that every screen has already been redesigned.
