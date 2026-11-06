CREATE TABLE booking_assessment_command (
 id uuid PRIMARY KEY, request_id uuid NOT NULL REFERENCES booking_request(id), actor_id text NOT NULL REFERENCES app_actor(id), idempotency_key uuid NOT NULL, digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'), created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(request_id,actor_id,idempotency_key)
);
CREATE TABLE booking_assessment (
 id uuid PRIMARY KEY, request_id uuid NOT NULL, quote_id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0), environment text NOT NULL CHECK(environment IN ('MANUAL','DEMO')), actor_id text NOT NULL REFERENCES app_actor(id), reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000), body jsonb NOT NULL CHECK(jsonb_typeof(body)='object'), digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'), created_at timestamptz NOT NULL DEFAULT clock_timestamp(), FOREIGN KEY(quote_id,request_id) REFERENCES booking_quotation(id,request_id), UNIQUE(request_id,revision), UNIQUE(id,request_id)
);
CREATE INDEX assessment_quote_history ON booking_assessment(quote_id,revision DESC);
CREATE TABLE booking_assessment_decision (
 id uuid PRIMARY KEY, assessment_id uuid NOT NULL UNIQUE, request_id uuid NOT NULL, actor_id text NOT NULL REFERENCES app_actor(id), decision text NOT NULL CHECK(decision IN ('ACCEPT','DISPUTE','WITHDRAW')), reason text NOT NULL CHECK(length(reason)<=2000 AND (decision='ACCEPT' OR length(trim(reason))>0)), created_at timestamptz NOT NULL DEFAULT clock_timestamp(), FOREIGN KEY(assessment_id,request_id) REFERENCES booking_assessment(id,request_id)
);
CREATE TRIGGER immutable_assessment_command BEFORE UPDATE OR DELETE ON booking_assessment_command FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_assessment BEFORE UPDATE OR DELETE ON booking_assessment FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_assessment_decision BEFORE UPDATE OR DELETE ON booking_assessment_decision FOR EACH ROW EXECUTE FUNCTION app_immutable();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN GRANT SELECT,INSERT ON booking_assessment_command,booking_assessment,booking_assessment_decision TO rent2go_app; END IF; END $$;
