ALTER TABLE booking_request DROP CONSTRAINT booking_request_status_check;
ALTER TABLE booking_request ADD CONSTRAINT booking_request_status_check CHECK(status IN ('REQUIREMENTS_PENDING','UNDER_REVIEW','CHANGES_REQUESTED','READY_FOR_APPROVAL','REJECTED','QUOTE_PENDING','QUOTE_ACCEPTED','QUOTE_DECLINED','HOLD_EXPIRED','AGREEMENT_PENDING','AGREEMENT_SIGNED','PAYMENT_PARTIAL','READY_FOR_SERVICE','PAYMENT_RECONCILIATION_REQUIRED'));
CREATE TABLE booking_payment_account (
 id uuid PRIMARY KEY, request_id uuid NOT NULL, quote_id uuid NOT NULL UNIQUE, agreement_id uuid NOT NULL,
 agency_id uuid NOT NULL, environment text NOT NULL CHECK(environment IN ('MANUAL','DEMO')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(request_id,agency_id) REFERENCES booking_request(id,agency_id),
 FOREIGN KEY(agreement_id,request_id,quote_id) REFERENCES booking_agreement(id,request_id,quote_id),
 UNIQUE(id,request_id,quote_id,agreement_id), UNIQUE(id,agency_id,environment)
);
CREATE TABLE booking_payment_command (
 id uuid PRIMARY KEY, request_id uuid NOT NULL REFERENCES booking_request(id), actor_id text NOT NULL REFERENCES app_actor(id),
 idempotency_key uuid NOT NULL, digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'), action text NOT NULL CHECK(action IN ('SUBMIT_GCASH','RECORD_CASH','REVIEW_GCASH','SIMULATE_PAYMENT','RESOLVE_DEMO')),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(request_id,actor_id,idempotency_key), UNIQUE(id,request_id)
);
CREATE TABLE booking_payment_attempt (
 id uuid PRIMARY KEY, account_id uuid NOT NULL, request_id uuid NOT NULL, quote_id uuid NOT NULL, agreement_id uuid NOT NULL,
 command_id uuid NOT NULL UNIQUE, actor_id text NOT NULL REFERENCES app_actor(id),
 method text NOT NULL CHECK(method IN ('CASH','GCASH','DEMO_CARD','DEMO_GCASH','DEMO_PAYPAL')),
 amount_centavos bigint NOT NULL CHECK(amount_centavos BETWEEN 1 AND 9007199254740991), reference text NOT NULL CHECK(length(trim(reference)) BETWEEN 1 AND 160), normalized_reference text NOT NULL CHECK(length(trim(normalized_reference)) BETWEEN 1 AND 160),
 initial_outcome text NOT NULL CHECK(initial_outcome IN ('SUBMITTED','PENDING','CONFIRMED','DECLINED','CANCELLED')), note text NOT NULL DEFAULT '',
 submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 file_id uuid UNIQUE, mime text, size_bytes integer, sha256 text, backend text,
 FOREIGN KEY(account_id,request_id,quote_id,agreement_id) REFERENCES booking_payment_account(id,request_id,quote_id,agreement_id),
 FOREIGN KEY(command_id,request_id) REFERENCES booking_payment_command(id,request_id),
 UNIQUE(id,account_id,request_id,quote_id,agreement_id),
 CHECK((file_id IS NULL AND mime IS NULL AND size_bytes IS NULL AND sha256 IS NULL AND backend IS NULL) OR (method='GCASH' AND file_id IS NOT NULL AND mime IS NOT NULL AND size_bytes IS NOT NULL AND sha256 IS NOT NULL AND backend IS NOT NULL AND mime IN ('image/png','image/jpeg','application/pdf') AND size_bytes BETWEEN 1 AND 5242880 AND sha256 ~ '^[a-f0-9]{64}$' AND backend IN ('local','s3')))
);
CREATE TABLE booking_payment_decision (
 id uuid PRIMARY KEY, attempt_id uuid NOT NULL UNIQUE, account_id uuid NOT NULL, request_id uuid NOT NULL, quote_id uuid NOT NULL, agreement_id uuid NOT NULL,
 command_id uuid NOT NULL UNIQUE, actor_id text NOT NULL REFERENCES app_actor(id), outcome text NOT NULL CHECK(outcome IN ('CONFIRMED','REJECTED','DECLINED','CANCELLED')), reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(attempt_id,account_id,request_id,quote_id,agreement_id) REFERENCES booking_payment_attempt(id,account_id,request_id,quote_id,agreement_id),
 FOREIGN KEY(command_id,request_id) REFERENCES booking_payment_command(id,request_id), UNIQUE(id,attempt_id)
);
CREATE TABLE booking_payment_collection (
 id uuid PRIMARY KEY, attempt_id uuid NOT NULL UNIQUE, account_id uuid NOT NULL, request_id uuid NOT NULL, quote_id uuid NOT NULL, agreement_id uuid NOT NULL,
 agency_id uuid NOT NULL, environment text NOT NULL CHECK(environment IN ('MANUAL','DEMO')), method text NOT NULL CHECK(method IN ('CASH','GCASH','DEMO_CARD','DEMO_GCASH','DEMO_PAYPAL')),
 amount_centavos bigint NOT NULL CHECK(amount_centavos BETWEEN 1 AND 9007199254740991), reference text NOT NULL CHECK(length(trim(reference)) BETWEEN 1 AND 160), normalized_reference text NOT NULL,
 recorded_by text NOT NULL REFERENCES app_actor(id), recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 receiver_name text NOT NULL, agency_name text NOT NULL, renter_name text NOT NULL,
 requires_reconciliation boolean NOT NULL,
 FOREIGN KEY(attempt_id,account_id,request_id,quote_id,agreement_id) REFERENCES booking_payment_attempt(id,account_id,request_id,quote_id,agreement_id),
 FOREIGN KEY(account_id,agency_id,environment) REFERENCES booking_payment_account(id,agency_id,environment),
 CHECK((environment='MANUAL' AND method IN ('CASH','GCASH')) OR (environment='DEMO' AND method IN ('DEMO_CARD','DEMO_GCASH','DEMO_PAYPAL'))),
 UNIQUE(id,request_id,quote_id), UNIQUE(id,account_id,request_id,quote_id,agreement_id)
);
CREATE UNIQUE INDEX booking_payment_confirmed_reference ON booking_payment_collection(agency_id,method,environment,normalized_reference) WHERE environment='MANUAL';
CREATE INDEX booking_payment_attempt_history ON booking_payment_attempt(request_id,submitted_at DESC,id);
CREATE INDEX booking_payment_collection_quote ON booking_payment_collection(quote_id);
CREATE TABLE booking_hold_commitment (
 hold_id uuid PRIMARY KEY, request_id uuid NOT NULL, quote_id uuid NOT NULL, first_collection_id uuid NOT NULL UNIQUE,
 committed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(hold_id,quote_id) REFERENCES booking_hold(id,quote_id),
 FOREIGN KEY(first_collection_id,request_id,quote_id) REFERENCES booking_payment_collection(id,request_id,quote_id)
);
CREATE TRIGGER immutable_booking_payment_account BEFORE UPDATE OR DELETE ON booking_payment_account FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_booking_payment_command BEFORE UPDATE OR DELETE ON booking_payment_command FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_booking_payment_attempt BEFORE UPDATE OR DELETE ON booking_payment_attempt FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_booking_payment_decision BEFORE UPDATE OR DELETE ON booking_payment_decision FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_booking_payment_collection BEFORE UPDATE OR DELETE ON booking_payment_collection FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_booking_hold_commitment BEFORE UPDATE OR DELETE ON booking_hold_commitment FOR EACH ROW EXECUTE FUNCTION app_immutable();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN
 GRANT SELECT,INSERT ON booking_payment_account,booking_payment_command,booking_payment_attempt,booking_payment_decision,booking_payment_collection,booking_hold_commitment TO rent2go_app;
END IF; END $$;
