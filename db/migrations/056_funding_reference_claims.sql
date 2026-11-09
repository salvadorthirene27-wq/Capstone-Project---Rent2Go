-- Rejected submissions may be corrected; an incoming transfer can be credited only once.
ALTER TABLE central_agency_funding DROP CONSTRAINT central_agency_funding_environment_normalized_reference_key;
CREATE TABLE central_funding_reference(environment text NOT NULL CHECK(environment IN ('DEMO','MANUAL')),normalized_reference text NOT NULL,funding_id uuid NOT NULL UNIQUE REFERENCES central_agency_funding(id),PRIMARY KEY(environment,normalized_reference));
CREATE TRIGGER immutable_central_funding_reference BEFORE UPDATE OR DELETE ON central_funding_reference FOR EACH ROW EXECUTE FUNCTION app_immutable();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN GRANT SELECT,INSERT ON central_funding_reference TO rent2go_app;END IF;END $$;
