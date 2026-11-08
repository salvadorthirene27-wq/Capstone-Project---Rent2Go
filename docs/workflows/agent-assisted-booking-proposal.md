# Agent-assisted rental enquiries — proposal only

Reviewed 8 November 2026; optional contact log approved 9 November 2026. This document records research and an approved contact-log extension; it does not change the implemented booking state machine, payment amounts, agency policies or manuscript.

## What the reference shows

The supplied Anis Transport screenshots show date/location/contact fields ending in Get a quote now, a separate fleet catalogue, Book now actions, and agent assistance. Its [public home page](https://www.anistransport.com/) presents category-based vehicles and indicative price ranges. Its [published terms](https://www.anistransport.com/terms.html), Booking Policy and Payments sections, describe a 50% down payment within three days of reservation, the remainder at trip start, and agent-issued card payment links. These are that operator’s terms, not Rent2Go defaults.

The public pages do not establish that every enquiry always receives a callback or exactly when an agent reserves inventory. Callback timing is the user’s observation and a proposed Rent2Go design choice. No quote was submitted, agent contacted, reservation made or payment performed during research.

## Existing Rent2Go foundation

The existing flow already separates cart estimates and agency-specific booking requests from requirements review, an itemized dated quotation with a temporary hold, renter acceptance, electronic agreement, confirmed collection, service readiness and handover. A request is not a confirmed reservation. A staff note is not payment evidence. The fleet Book now link opens the existing selection form; this UI change introduces no instant reservation.

## Proposed integration for approval

Add an agency-scoped contact log to the existing request, rather than a competing booking system:

1. The renter chooses dates, guests and rental mode, then submits a request to the selected agency. No inventory or money is held at this point.
2. An authorized agency operator assigns the follow-up, records the renter’s preferred contact method/time, and clarifies destination, pickup, eligibility and inclusions. An enquiry may proceed online without a mandatory call when its details are already complete.
3. Record contact attempts and outcomes such as reached, awaiting reply or withdrawn, with an optional next follow-up date. Limit internal notes to relevant service information. The renter sees the customer-facing update, not internal staff notes.
4. Continue the existing requirements review. An interested phone response does not accept a quotation or agreement.
5. Only when issuing an exact quotation does the system recheck availability and establish the existing timed hold. The renter accepts the exact terms in the portal and signs the agreement. Expired holds require availability to be checked again.
6. Continue the approved payment/confirmation path. Verify provider receipts on the server; a redirect, callback note, staff assertion or client screenshot alone cannot confirm an online payment.
7. Retain the existing inspections, service completion, charges, refunds, financial closing, Cosigner shares and disbursement records.

Use the existing request and quotation identifiers in email/contact references. Keep each agency’s queue separate, retain who recorded each outcome, restrict contact information to participants, and never expose renter documents or contact details to unrelated agencies or Cosigners. Contact logs do not approve documents, sign for renters, extend holds or alter financial records. Notifications must continue respecting configured delivery permissions; an agent log must not silently send emails.

## Decisions before implementation

The user initially requested research without booking-process code changes and subsequently approved the optional agency contact log, including staff assignment, attempts and follow-up outcomes, while retaining portal acceptance and current payment rules. The optional contact log is implemented; see [agency contact workflow](agency-contact-log.md). Any additional pre-registration enquiry form still requires approval. A separate enquiry before registration/identity review would expand the manuscript architecture and needs an explicit decision on retention, verification, abuse protection and conversion into the authenticated request.

Do not import the reference operator’s 50%/three-day rule automatically. Rent2Go currently requires the agreed service amount and refundable deposit to be covered before service readiness. Supporting a different confirmation threshold or reservation down payment needs a separate reviewed design for deadlines, cancellation, allocation, refunds, agreements and central custody. Do not introduce PayPal as a PayMongo-supported method.
