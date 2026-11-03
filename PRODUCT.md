# Rent2Go product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

The manuscript specifies Next.js and Neon PostgreSQL with private file storage. Proposed implementation: one TypeScript Next.js application, transactional domain services, and four role workspaces. Supporting libraries remain engineering decisions, subject to the written design review.

## Users

- Renters browse agency vehicles and tours, submit requirements, review quotations, sign agreements, and follow their bookings.
- Cosigners own vehicles offered through approved partner agencies and review their own utilization, earnings, commissions, and withdrawals.
- Agency Admins apply for partnership and operate their own approved agency's listings, bookings, policies, reviews, inspections, and financial records.
- Super Admins review partner agencies and vehicle compliance, govern accounts and platform policies, and inspect authorized platform reports and audit records.

## Product Purpose

Rent2Go coordinates car rentals and travel/tour packages across multiple approved agencies. A booking's requirements, approvals, price, agreement, payment review, delivery, completion, and financial records belong to one coherent workflow.

## Operating Context

The immediate target is a local demonstration, with a new Neon database. Internet access is still needed for Neon and enabled external providers. Formal usability evaluation and final manuscript results will follow implementation and actual testing.

## Capabilities and Constraints

- Multiple agencies, with no pilot agency or special status for VSME.
- Both scheduled tours sold per person and private tours priced per party; each package declares pricing and capacity rules.
- Partner applications collect business details, terms and conditions, pricing, and payment settings for review. This is the current implementation priority.
- Manual GCash receipt review and cash confirmation are manuscript workflows. The user additionally authorized clearly labeled demo payment simulations such as card, GCash, and PayPal; no live gateway settlement is claimed.
- OCR assists an authorized human reviewer; it never approves identity or document authenticity.
- GPS, geofencing, device integration, route history, and remote vehicle controls are excluded.
- Start from the new repository and new database. Do not reuse the old environment file, database, source implementation, or main-branch files.
- Sensitive renter documents, ownership documents, signatures, receipts, and inspection evidence require private storage and authorized access.
- Financial rates and policies are agency/platform configuration, with versioned snapshots. No binding commercial amounts have been supplied.

## Brand Commitments

Name: Rent2Go. The user requires the new interface to complement the existing develop-branch design. Its forest green/mint identity, light surfaces, rounded controls, and familiar dashboard structure are the visual reference. Build directly in code with reviewed screens. Existing misleading copy or incomplete controls are not evidence of approved business behavior.

## Evidence on Hand

The supplied 82-page manuscript is the requirements source. Chapters 1–3 define the baseline; Chapters 4–5 contain provisional implementation descriptions and unfilled testing/evaluation templates. No actual new-system test results, adoption figures, endorsements, or usability scores exist yet. Existing develop screens are visual references only. The manuscript and private documents must not be committed to the public repository.

## Product Principles

- Make each role's next required action clear.
- Enforce ownership and agency boundaries on the server.
- Preserve the accepted price, policy, and agreement version for every booking.
- Distinguish evidence submitted, human approval, recorded payment, and paid withdrawal.
- Make demonstration data and simulated payments unmistakable.

## Accessibility & Inclusion

Responsive web interfaces must support keyboard operation, readable text and errors, visible focus, labeled controls, and tables or text alternatives for charts. Accessibility is an evaluation dimension in the manuscript; conformance must be assessed rather than asserted.

## Open Decisions

- Clarify whether agency payment settings cover agency-to-Rent2Go fees, renter payment methods, or both (question pending).
- Review and approve the functional design before implementation.
- Configure new provider credentials where needed; no production email, OCR, storage, or payment validation has occurred.
