# Workspace navigation and catalog presentation — 7 November 2026

The established forest/mint theme, landing composition and original landing assets remain. Shared public navigation is unchanged in scope. Workspace links are grouped by task; agency detail routes also expose fleet, tours, bookings and resource links for that agency. These are navigation aids; all server-side membership and participant checks remain authoritative.

At mobile widths the workspace links open in the page under a named menu button. Escape closes the menu and restores focus; moving focus away, following a link or changing routes closes it. A single selected link distinguishes agency bookings from the overview. Booking details offer a status-specific next step and eight links to actual section headings. Saved request history stays verbatim inside an expandable disclosure.

General interface banners and footer wording no longer call the website a development or testing environment. Payment simulations, original simulated collections and refund records remain explicitly identified as simulated. Internal financial enums, audit history and agency-authored saved policies were not rewritten. PayMongo is planned only after the remaining workflows are complete; no gateway or funds-transfer capability is claimed.

## Sample photographs

A decoded-image audit found three HTTP200 responses containing1×1PNG placeholders. The affected Coastal Journeys agency-owned Electric sedan, City sedan and Family van now use attributed representative Tesla Model3, Toyota Vios and Toyota Hiace photographs. Each offer followed unpublish → amend → save → remove current placeholder → private image upload → submit → independent approval → publish. Original terms, old revision files and historical records remain unchanged. Descriptions explain that photographs are representative, rather than evidence of agency ownership or the listed model year. The other four listings already had usable images and were left unchanged. All five rentals and two tours now deliver images larger than100px in both dimensions. Original downloads, hashes, licenses and sources are recorded in `public/demo/credits.json` with CC BY-SA notices accessible under Media licences in Marketplace terms.

## Repository names and attribution

Seventeen remote feature branches were renamed to the neutral `feature/` prefix through GitHub's rename operation. Three additional local-only branches were renamed as well. Every renamed remote head was checked against its original commit, and main remained unchanged during the rename. No history was rewritten. Project-authored descriptions of the UI design skill now use neutral wording. Upstream source paths, installed skill code/data, required framework instruction files, licenses and image/design credits remain intact. Local workspace paths are unchanged.

## Verification

- 263 unit/interface checks in59 files; the added coverage exercises exact current sections, role-scoped navigation, Escape/focus behavior, link/route closing and safe next-step guidance.
- Production build and subsequent standalone TypeScript check passed.
- 26 shared-navigation HTTP/DOM/contrast checks plus19 focused public/authenticated booking checks passed against the served build.
- All seven catalog images were fetched and decoded, including current dimensions; the three repaired offers' terms and original revision-file lists were compared before/after.
- Actual browser review at1440px and375px verified home/vehicle imagery and booking guidance, mobile menu opening/closing, Escape focus, no horizontal overflow and the next-step link reaching the assessment heading100px below the viewport top. The temporary sample-account browser session was signed out and its tab closed.
- Private consistent application-row exports were saved before/after photo replacement (75 tables, schema024); these do not include managed authentication or object-storage bytes and do not constitute a tested full restore.

The UI UX Pro Max quick-reference recommendations informed target sizes, reduced motion, focus visibility, responsive layout and progressive disclosure. The specific disclosure search did not return a verified match, so that pattern uses the quick-reference guidance and project judgment. Next.js Link guidance was verified locally; existing transactional API routes remain the implementation contract. No database migration or financial calculation changed in this checkpoint.

## Current follow-up — 8 November 2026

The earlier connection/browser limitations above are superseded by the verified fleet/navigation checkpoint. Account/privacy, cart and checkout now share Workspace. See [route audit](navigation-route-audit.md) and [display-name evidence](current-display-names.md). Public/print exceptions remain intentional; booking process changes in the [agent proposal](workflows/agent-assisted-booking-proposal.md) remain unimplemented pending approval.
