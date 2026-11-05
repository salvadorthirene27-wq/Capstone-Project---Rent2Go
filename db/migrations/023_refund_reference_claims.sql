-- Claim outgoing manual references across requests in the same agency/method.
-- Separate immutable claims avoid changing previously stored refund evidence.
CREATE TABLE booking_refund_reference(
 agency_id uuid NOT NULL REFERENCES agency(id),method text NOT NULL CHECK(method IN ('CASH','GCASH')),normalized_reference text NOT NULL CHECK(length(trim(normalized_reference)) BETWEEN 1 AND 160),attempt_id uuid NOT NULL UNIQUE REFERENCES booking_refund_attempt(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(agency_id,method,normalized_reference)
);
CREATE TRIGGER immutable_refund_reference BEFORE UPDATE OR DELETE ON booking_refund_reference FOR EACH ROW EXECUTE FUNCTION app_immutable();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN
 GRANT SELECT,INSERT ON booking_refund_reference TO rent2go_app;
END IF; END $$;
