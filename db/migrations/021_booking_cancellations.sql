ALTER TABLE booking_request DROP CONSTRAINT booking_request_status_check;
ALTER TABLE booking_request ADD CONSTRAINT booking_request_status_check CHECK(status IN ('REQUIREMENTS_PENDING','UNDER_REVIEW','CHANGES_REQUESTED','READY_FOR_APPROVAL','REJECTED','QUOTE_PENDING','QUOTE_ACCEPTED','QUOTE_DECLINED','HOLD_EXPIRED','AGREEMENT_PENDING','AGREEMENT_SIGNED','PAYMENT_PARTIAL','READY_FOR_SERVICE','PAYMENT_RECONCILIATION_REQUIRED','SERVICE_ACTIVE','FULFILLMENT_RECONCILIATION_PENDING','CANCELLED','CANCELLED_RECONCILIATION_PENDING'));
ALTER TABLE booking_hold DROP CONSTRAINT booking_hold_check;
ALTER TABLE booking_hold ADD CONSTRAINT booking_hold_check CHECK((released_at IS NULL AND release_reason IS NULL) OR (released_at IS NOT NULL AND release_reason IN ('EXPIRED','DECLINED','WITHDRAWN','CANCELLED')));
CREATE TABLE booking_cancellation_command(
 id uuid PRIMARY KEY,request_id uuid NOT NULL REFERENCES booking_request(id),actor_id text NOT NULL REFERENCES app_actor(id),idempotency_key uuid NOT NULL,digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(request_id,actor_id,idempotency_key)
);
CREATE TABLE booking_cancellation_request(
 id uuid PRIMARY KEY,request_id uuid NOT NULL REFERENCES booking_request(id),quote_id uuid,actor_id text NOT NULL REFERENCES app_actor(id),reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),body jsonb NOT NULL CHECK(jsonb_typeof(body)='object'),digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(quote_id,request_id) REFERENCES booking_quotation(id,request_id),UNIQUE(id,request_id)
);
CREATE TABLE booking_cancellation_decision(
 id uuid PRIMARY KEY,cancellation_id uuid NOT NULL UNIQUE,request_id uuid NOT NULL,actor_id text NOT NULL REFERENCES app_actor(id),decision text NOT NULL CHECK(decision IN ('APPROVE','REJECT','WITHDRAW')),reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(cancellation_id,request_id) REFERENCES booking_cancellation_request(id,request_id)
);
CREATE INDEX booking_cancellation_history ON booking_cancellation_request(request_id,created_at DESC);
CREATE TRIGGER immutable_cancellation_command BEFORE UPDATE OR DELETE ON booking_cancellation_command FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_cancellation_request BEFORE UPDATE OR DELETE ON booking_cancellation_request FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_cancellation_decision BEFORE UPDATE OR DELETE ON booking_cancellation_decision FOR EACH ROW EXECUTE FUNCTION app_immutable();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN
 GRANT SELECT,INSERT ON booking_cancellation_command,booking_cancellation_request,booking_cancellation_decision TO rent2go_app;
END IF; END $$;
