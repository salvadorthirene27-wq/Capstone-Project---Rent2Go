CREATE TABLE booking_owner_allocation_command (
 id uuid PRIMARY KEY,
 request_id uuid NOT NULL REFERENCES booking_request(id),
 actor_id text NOT NULL REFERENCES app_actor(id),
 idempotency_key uuid NOT NULL,
 digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(request_id,actor_id,idempotency_key)
);
CREATE TABLE booking_owner_allocation_decision (
 id uuid PRIMARY KEY,
 assessment_id uuid NOT NULL,
 request_id uuid NOT NULL,
 offer_id uuid NOT NULL REFERENCES vehicle_offer(id),
 actor_id text NOT NULL REFERENCES app_actor(id),
 decision text NOT NULL CHECK(decision IN ('ACCEPT','DISPUTE')),
 consent boolean NOT NULL,
 reason text NOT NULL CHECK(length(reason)<=2000),
 body jsonb NOT NULL CHECK(jsonb_typeof(body)='object'),
 digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(assessment_id,request_id) REFERENCES booking_assessment(id,request_id),
 UNIQUE(assessment_id,offer_id),
 CHECK((decision='ACCEPT' AND consent) OR (decision='DISPUTE' AND NOT consent AND length(trim(reason))>0))
);
CREATE INDEX owner_allocation_history ON booking_owner_allocation_decision(offer_id,created_at DESC);
CREATE TRIGGER immutable_owner_allocation_command BEFORE UPDATE OR DELETE ON booking_owner_allocation_command FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_owner_allocation_decision BEFORE UPDATE OR DELETE ON booking_owner_allocation_decision FOR EACH ROW EXECUTE FUNCTION app_immutable();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN GRANT SELECT,INSERT ON booking_owner_allocation_command,booking_owner_allocation_decision TO rent2go_app; END IF; END $$;
