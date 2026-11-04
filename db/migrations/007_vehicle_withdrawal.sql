-- Withdrawal is an explicit stop, not an agency-reversible publication toggle.
-- Returning to market requires a new owner submission, accepted terms and compliance review.
ALTER TABLE vehicle_offer DROP CONSTRAINT vehicle_offer_state_check;
ALTER TABLE vehicle_offer ADD CONSTRAINT vehicle_offer_state_check CHECK(state IN ('DRAFT','SUBMITTED','AGREEMENT_PENDING','COMPLIANCE_REVIEW','APPROVED','PUBLISHED','CHANGES_REQUESTED','REJECTED','WITHDRAWN'));
