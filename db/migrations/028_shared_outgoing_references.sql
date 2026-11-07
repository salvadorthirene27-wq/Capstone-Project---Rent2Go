-- A manual transfer has one purpose, even across refund and owner-payout modules.
CREATE TABLE agency_outgoing_reference (
 agency_id uuid NOT NULL REFERENCES agency(id),method text NOT NULL CHECK(method IN ('CASH','GCASH')),normalized_reference text NOT NULL CHECK(length(trim(normalized_reference)) BETWEEN 1 AND 160),refund_attempt_id uuid UNIQUE REFERENCES booking_refund_attempt(id),owner_payout_id uuid UNIQUE REFERENCES owner_payout(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(agency_id,method,normalized_reference),CHECK(num_nonnulls(refund_attempt_id,owner_payout_id)=1)
);
INSERT INTO agency_outgoing_reference(agency_id,method,normalized_reference,refund_attempt_id) SELECT agency_id,method,normalized_reference,attempt_id FROM booking_refund_reference;
INSERT INTO agency_outgoing_reference(agency_id,method,normalized_reference,owner_payout_id) SELECT agency_id,method,normalized_reference,id FROM owner_payout WHERE environment='MANUAL';
CREATE FUNCTION claim_manual_outgoing_reference() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='booking_refund_reference' THEN
  INSERT INTO agency_outgoing_reference(agency_id,method,normalized_reference,refund_attempt_id) VALUES(NEW.agency_id,NEW.method,NEW.normalized_reference,NEW.attempt_id);
 ELSIF NEW.environment='MANUAL' THEN
  INSERT INTO agency_outgoing_reference(agency_id,method,normalized_reference,owner_payout_id) VALUES(NEW.agency_id,NEW.method,NEW.normalized_reference,NEW.id);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER claim_refund_outgoing_reference AFTER INSERT ON booking_refund_reference FOR EACH ROW EXECUTE FUNCTION claim_manual_outgoing_reference();
CREATE TRIGGER claim_owner_outgoing_reference AFTER INSERT ON owner_payout FOR EACH ROW EXECUTE FUNCTION claim_manual_outgoing_reference();
CREATE TRIGGER immutable_agency_outgoing_reference BEFORE UPDATE OR DELETE ON agency_outgoing_reference FOR EACH ROW EXECUTE FUNCTION app_immutable();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN GRANT SELECT,INSERT ON agency_outgoing_reference TO rent2go_app; END IF; END $$;
