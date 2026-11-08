-- Supervision for the independently gated provider-status worker.
ALTER TABLE background_worker DROP CONSTRAINT background_worker_name_check;
ALTER TABLE background_worker ADD CONSTRAINT background_worker_name_check CHECK(name IN('BOOKING_HOLD_EXPIRY','PAYMONGO_CHECKOUT_SYNC'));
CREATE INDEX paymongo_checkout_due ON paymongo_checkout_state(next_poll_at,checkout_id) WHERE NOT review_required;
