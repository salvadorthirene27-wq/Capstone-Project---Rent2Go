# Current unified workspace checkpoint — 9 November 2026

The top-bar notification bell and grouped Account, My vehicles and Agency partnership areas supersede the earlier separate sidebar links. Desktop/mobile browser checks are complete for these changes. See [current behavior and precise evidence](workflows/workspace-hubs.md). Earlier connection/browser limitations below are historical; the approved optional agency contact log was subsequently implemented.

--- Prior records retained ---

# Unified navigation — 7 November 2026

The root layout renders one shared Header across the home page, marketplace, partner pages and role workspaces. Links, forest/mint pill styling, mobile disclosure, account creation/sign-in, sign-out, cart count and active section rules come from one implementation. The former independent landing navigation and its unused CSS were removed. Workspace sidebars remain contextual navigation for the signed-in role.

Login and saved agreement, condition, collection and refund records use a compact brand/back header; they do not need the marketplace menu. Existing print styles continue hiding site chrome. Home hero height accounts for navigation above it while preserving the original photograph and content sequence.

The UI UX Pro Max navigation searches did not return a specific verified rule for cross-page consistency. Existing DESIGN.md and the user's explicit request govern this refactor; previously verified focus-visibility and internal Link guidance remain applicable. Menus expand in document flow, Escape restores the toggle, leaving the header closes the menu without stealing focus, and route changes reset disclosure state.

Unit coverage includes identical links across home/inner pages, account creation, all five compact route families, cart refresh, exact active section, Escape/focus behavior, route-change dismissal and recoverable sign-out. Production build, type checking and HTTP/DOM checks are recorded in STATUS.md. Updated browser layout and human usability remain unverified due to the previously recorded browser-control failure.

The final live smoke run encountered database connection timeouts on `/rentals`. Both pooled/direct native connections and all three resolved proxy addresses timed out; the existing Neon branch/compute is ready and a restricted-role SELECT1 through the connected Neon service succeeded. This is not reported as a successful live database regression. No environment credentials, database endpoint, driver or schema were changed to conceal the failure. Static HTTP checks cover the shared home/partner/login header and delivered CSS; database-backed checks must be rerun once the laptop can reach Neon.

## Current follow-up — 8 November 2026

The earlier connection/browser limitations above are superseded by the verified fleet/navigation checkpoint. Account/privacy, cart and checkout now share Workspace. See [route audit](navigation-route-audit.md) and [display-name evidence](current-display-names.md). Public/print exceptions remain intentional; booking process changes in the [agent proposal](workflows/agent-assisted-booking-proposal.md) remain unimplemented pending approval.
