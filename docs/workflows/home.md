# Home page

Approved direction, 5 November 2026: use Marc Albert's develop landing page as the visual reference. Source commit c7c9e96; app/page.tsx and the nine referenced public assets only. No source database, authentication, application logic, or old environment is imported.

Preserve the 96% width, 800px photographic hero, 40px radius, black/50% image treatment, forest/mint colors, Poppins headings, Inter body, brand strip, three role panels, vehicle categories, final call-to-action, and footer composition. The original inert buttons now link into current routes. Navigation includes agencies and cart; mobile navigation supports Escape/focus restoration. Signup opens the current account creation form. Signed-in visitors receive workspace and sign-out actions.

Cosigner descriptions now refer to personal vehicle ownership and consignment agreements. Remove source claims about guarantors, vehicle tracking, thousands of customers, and continuous support. Logo marks are illustrative and do not establish actual stock or endorsement.

## Direction contract

THESIS: retain the supplied landing page composition and connect it to the current marketplace.
OWN-WORLD: original forest #2F5D50, mint #ABD1C6, rounded hero and pills, original photographic assets.
STORY: visitors browse rentals/tours, find approved agencies, apply for partnership, or access their account.
FIRST VIEWPORT: original Jeep photo at 50% opacity; centered heading and two actions; brand left, navigation center, account controls right.
FORM: user-specified source composition, no concept selection required. Compiled original Tailwind utilities are scoped to .marc-home to protect existing workspaces.
FINISH: inspect desktop and narrow navigation, check real route destinations and signup state, run checks, record limitations, checkpoint and push.

Asset provenance: public/landing/provenance.json records source paths and hashes. Original asset photographer/license details were not included in the source repository; preserve this uncertainty, do not invent attribution.

Finish verdict:61tests, TypeScript and production build pass. The independent bounded review's two mobile navigation issues are corrected; the dropdown was then observed below the account controls in a narrow Edge browser panel. Desktop hero/navigation were inspected. Nine served assets match their source hashes. Source composition and typography are retained, but no exact per-pixel equivalence claim is made without a running-source comparison. DESIGN.md continues to describe the established green/mint visual system; this route's larger radii and photographic composition follow the user's explicit source reference.
