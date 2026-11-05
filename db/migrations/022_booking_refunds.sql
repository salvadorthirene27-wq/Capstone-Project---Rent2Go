ALTER TABLE booking_payment_collection ADD UNIQUE(id,request_id,quote_id,agency_id,environment);
CREATE TABLE booking_refund_command(
 id uuid PRIMARY KEY,request_id uuid NOT NULL REFERENCES booking_request(id),actor_id text NOT NULL REFERENCES app_actor(id),idempotency_key uuid NOT NULL,digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),action text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(request_id,actor_id,idempotency_key),UNIQUE(id,request_id)
);
CREATE TABLE booking_refund_request(
 id uuid PRIMARY KEY,request_id uuid NOT NULL,collection_id uuid NOT NULL,quote_id uuid NOT NULL,agency_id uuid NOT NULL,environment text NOT NULL CHECK(environment IN ('MANUAL','DEMO')),actor_id text NOT NULL REFERENCES app_actor(id),amount_centavos bigint NOT NULL CHECK(amount_centavos BETWEEN 1 AND 9007199254740991),reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),policy_snapshot jsonb NOT NULL CHECK(jsonb_typeof(policy_snapshot)='object'),digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(collection_id,request_id,quote_id,agency_id,environment) REFERENCES booking_payment_collection(id,request_id,quote_id,agency_id,environment),UNIQUE(id,request_id),UNIQUE(id,request_id,environment),UNIQUE(id,amount_centavos,environment)
);
CREATE TABLE booking_refund_decision(
 id uuid PRIMARY KEY,refund_id uuid NOT NULL UNIQUE,request_id uuid NOT NULL,actor_id text NOT NULL REFERENCES app_actor(id),decision text NOT NULL CHECK(decision IN ('APPROVE','REJECT')),reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(refund_id,request_id) REFERENCES booking_refund_request(id,request_id)
);
CREATE TABLE booking_refund_cancel(
 id uuid PRIMARY KEY,refund_id uuid NOT NULL UNIQUE,request_id uuid NOT NULL,actor_id text NOT NULL REFERENCES app_actor(id),action text NOT NULL CHECK(action IN ('WITHDRAW','REVOKE')),reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(refund_id,request_id) REFERENCES booking_refund_request(id,request_id)
);
CREATE TABLE booking_refund_attempt(
 id uuid PRIMARY KEY,refund_id uuid NOT NULL,request_id uuid NOT NULL,environment text NOT NULL CHECK(environment IN ('MANUAL','DEMO')),actor_id text NOT NULL REFERENCES app_actor(id),command_id uuid NOT NULL UNIQUE REFERENCES booking_refund_command(id),method text NOT NULL CHECK(method IN ('CASH','GCASH','DEMO_CARD','DEMO_GCASH','DEMO_PAYPAL')),reference text NOT NULL CHECK(length(trim(reference)) BETWEEN 1 AND 160),normalized_reference text NOT NULL CHECK(length(trim(normalized_reference)) BETWEEN 1 AND 160),initial_outcome text NOT NULL CHECK(initial_outcome IN ('CONFIRMED','DECLINED','PENDING','CANCELLED')),note text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT clock_timestamp(),file_id uuid UNIQUE,mime text,size_bytes integer,sha256 text,backend text,
 FOREIGN KEY(refund_id,request_id,environment) REFERENCES booking_refund_request(id,request_id,environment),FOREIGN KEY(command_id,request_id) REFERENCES booking_refund_command(id,request_id),UNIQUE(id,refund_id,request_id,environment),
 CHECK((environment='DEMO' AND method IN ('DEMO_CARD','DEMO_GCASH','DEMO_PAYPAL') AND file_id IS NULL AND mime IS NULL AND size_bytes IS NULL AND sha256 IS NULL AND backend IS NULL) OR (environment='MANUAL' AND method IN ('CASH','GCASH') AND initial_outcome='CONFIRMED' AND file_id IS NOT NULL AND mime IS NOT NULL AND size_bytes IS NOT NULL AND sha256 IS NOT NULL AND backend IS NOT NULL AND mime IN ('image/png','image/jpeg','application/pdf') AND size_bytes BETWEEN 1 AND 5242880 AND sha256 ~ '^[a-f0-9]{64}$' AND backend IN ('local','s3')))
);
CREATE TABLE booking_refund_resolution(
 id uuid PRIMARY KEY,attempt_id uuid NOT NULL UNIQUE,refund_id uuid NOT NULL,request_id uuid NOT NULL,environment text NOT NULL CHECK(environment='DEMO'),actor_id text NOT NULL REFERENCES app_actor(id),command_id uuid NOT NULL UNIQUE REFERENCES booking_refund_command(id),outcome text NOT NULL CHECK(outcome IN ('CONFIRMED','DECLINED','CANCELLED')),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(attempt_id,refund_id,request_id,environment) REFERENCES booking_refund_attempt(id,refund_id,request_id,environment),FOREIGN KEY(command_id,request_id) REFERENCES booking_refund_command(id,request_id)
);
CREATE TABLE booking_refund_payment(
 id uuid PRIMARY KEY,refund_id uuid NOT NULL UNIQUE,attempt_id uuid NOT NULL UNIQUE,request_id uuid NOT NULL,environment text NOT NULL,amount_centavos bigint NOT NULL,recorded_by text NOT NULL REFERENCES app_actor(id),recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(attempt_id,refund_id,request_id,environment) REFERENCES booking_refund_attempt(id,refund_id,request_id,environment),FOREIGN KEY(refund_id,amount_centavos,environment) REFERENCES booking_refund_request(id,amount_centavos,environment)
);
CREATE INDEX booking_refund_source ON booking_refund_request(collection_id);
CREATE INDEX booking_refund_history ON booking_refund_request(request_id,created_at DESC,id);
CREATE INDEX booking_refund_attempt_history ON booking_refund_attempt(refund_id,created_at DESC,id);
CREATE TRIGGER immutable_refund_command BEFORE UPDATE OR DELETE ON booking_refund_command FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_refund_request BEFORE UPDATE OR DELETE ON booking_refund_request FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_refund_decision BEFORE UPDATE OR DELETE ON booking_refund_decision FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_refund_cancel BEFORE UPDATE OR DELETE ON booking_refund_cancel FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_refund_attempt BEFORE UPDATE OR DELETE ON booking_refund_attempt FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_refund_resolution BEFORE UPDATE OR DELETE ON booking_refund_resolution FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_refund_payment BEFORE UPDATE OR DELETE ON booking_refund_payment FOR EACH ROW EXECUTE FUNCTION app_immutable();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN
 GRANT SELECT,INSERT ON booking_refund_command,booking_refund_request,booking_refund_decision,booking_refund_cancel,booking_refund_attempt,booking_refund_resolution,booking_refund_payment TO rent2go_app;
END IF; END $$;
