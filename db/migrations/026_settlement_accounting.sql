ALTER TABLE booking_request DROP CONSTRAINT booking_request_status_check;
ALTER TABLE booking_request ADD CONSTRAINT booking_request_status_check CHECK(status IN ('REQUIREMENTS_PENDING','UNDER_REVIEW','CHANGES_REQUESTED','READY_FOR_APPROVAL','REJECTED','QUOTE_PENDING','QUOTE_ACCEPTED','QUOTE_DECLINED','HOLD_EXPIRED','AGREEMENT_PENDING','AGREEMENT_SIGNED','PAYMENT_PARTIAL','READY_FOR_SERVICE','PAYMENT_RECONCILIATION_REQUIRED','SERVICE_ACTIVE','FULFILLMENT_RECONCILIATION_PENDING','CANCELLED','CANCELLED_RECONCILIATION_PENDING','COMPLETED'));
ALTER TABLE booking_assessment ADD UNIQUE(id,request_id,quote_id);
CREATE TABLE booking_settlement_command (
 id uuid PRIMARY KEY,request_id uuid NOT NULL REFERENCES booking_request(id),actor_id text NOT NULL REFERENCES app_actor(id),idempotency_key uuid NOT NULL,digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(request_id,actor_id,idempotency_key)
);
CREATE TABLE booking_settlement (
 id uuid PRIMARY KEY,request_id uuid NOT NULL,quote_id uuid NOT NULL,assessment_id uuid NOT NULL,revision integer NOT NULL CHECK(revision>0),environment text NOT NULL CHECK(environment IN ('MANUAL','DEMO')),actor_id text NOT NULL REFERENCES app_actor(id),reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),body jsonb NOT NULL CHECK(jsonb_typeof(body)='object'),digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(assessment_id,request_id,quote_id) REFERENCES booking_assessment(id,request_id,quote_id),UNIQUE(request_id,revision),UNIQUE(id,request_id,quote_id),UNIQUE(id,request_id)
);
CREATE TABLE booking_settlement_decision (
 id uuid PRIMARY KEY,settlement_id uuid NOT NULL UNIQUE,request_id uuid NOT NULL,actor_id text NOT NULL REFERENCES app_actor(id),decision text NOT NULL CHECK(decision IN ('ACCEPT','DISPUTE','WITHDRAW')),reason text NOT NULL CHECK(length(reason)<=2000 AND (decision='ACCEPT' OR length(trim(reason))>0)),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(settlement_id,request_id) REFERENCES booking_settlement(id,request_id)
);
CREATE TABLE booking_settlement_payment_attempt (
 attempt_id uuid PRIMARY KEY,settlement_id uuid NOT NULL,request_id uuid NOT NULL,quote_id uuid NOT NULL,agreement_id uuid NOT NULL,account_id uuid NOT NULL,FOREIGN KEY(attempt_id,account_id,request_id,quote_id,agreement_id) REFERENCES booking_payment_attempt(id,account_id,request_id,quote_id,agreement_id),FOREIGN KEY(settlement_id,request_id,quote_id) REFERENCES booking_settlement(id,request_id,quote_id)
);
CREATE TABLE booking_financial_close (
 id uuid PRIMARY KEY,request_id uuid NOT NULL UNIQUE,quote_id uuid NOT NULL,settlement_id uuid NOT NULL UNIQUE,agency_id uuid NOT NULL,environment text NOT NULL CHECK(environment IN ('MANUAL','DEMO')),actor_id text NOT NULL REFERENCES app_actor(id),outcome text NOT NULL CHECK(outcome IN ('DELIVERED','CANCELLED','EXPIRED')),total_centavos bigint NOT NULL CHECK(total_centavos BETWEEN 0 AND 9007199254740991),body jsonb NOT NULL CHECK(jsonb_typeof(body)='object'),digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(settlement_id,request_id,quote_id) REFERENCES booking_settlement(id,request_id,quote_id),FOREIGN KEY(request_id,agency_id) REFERENCES booking_request(id,agency_id),UNIQUE(id,request_id,quote_id,agency_id,environment)
);
CREATE TABLE booking_revenue_entry (
 id uuid PRIMARY KEY,close_id uuid NOT NULL,request_id uuid NOT NULL,quote_id uuid NOT NULL,line_id uuid NOT NULL,agency_id uuid NOT NULL,environment text NOT NULL,source_kind text NOT NULL CHECK(source_kind IN ('SERVICE','EXTRA')),source_id uuid NOT NULL,recipient text NOT NULL CHECK(recipient IN ('COSIGNER','AGENCY','PLATFORM','MAINTENANCE')),beneficiary_actor_id text REFERENCES app_actor(id),vehicle_id uuid REFERENCES physical_vehicle(id),basis_centavos bigint NOT NULL CHECK(basis_centavos BETWEEN 1 AND 9007199254740991),bps integer NOT NULL CHECK(bps BETWEEN 0 AND 10000),amount_centavos bigint NOT NULL CHECK(amount_centavos BETWEEN 0 AND basis_centavos),policy_snapshot jsonb NOT NULL CHECK(jsonb_typeof(policy_snapshot)='object'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(close_id,request_id,quote_id,agency_id,environment) REFERENCES booking_financial_close(id,request_id,quote_id,agency_id,environment),FOREIGN KEY(quote_id,request_id,line_id) REFERENCES booking_quotation_line(quote_id,request_id,line_id),UNIQUE(close_id,source_kind,source_id,recipient),CHECK(source_kind<>'SERVICE' OR source_id=line_id),CHECK((recipient<>'COSIGNER' AND beneficiary_actor_id IS NULL) OR (recipient='COSIGNER' AND (amount_centavos=0 OR beneficiary_actor_id IS NOT NULL)))
);
CREATE INDEX revenue_owner_history ON booking_revenue_entry(beneficiary_actor_id,agency_id,environment,created_at DESC);
CREATE INDEX revenue_agency_history ON booking_revenue_entry(agency_id,environment,created_at DESC);
CREATE FUNCTION assert_booking_revenue_conservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE close_key uuid; expected bigint; actual numeric;
BEGIN
 IF TG_TABLE_NAME='booking_financial_close' THEN close_key:=NEW.id; ELSE close_key:=NEW.close_id; END IF;
 SELECT total_centavos INTO expected FROM booking_financial_close WHERE id=close_key;
 SELECT COALESCE(sum(amount_centavos),0) INTO actual FROM booking_revenue_entry WHERE close_id=close_key;
 IF expected IS NULL OR actual<>expected THEN RAISE EXCEPTION 'Settlement revenue does not conserve the exact retained obligation'; END IF;
 IF EXISTS(SELECT 1 FROM booking_revenue_entry WHERE close_id=close_key GROUP BY source_kind,source_id HAVING count(*)<>4 OR sum(bps)<>10000 OR min(basis_centavos)<>max(basis_centavos) OR sum(amount_centavos)<>max(basis_centavos)) THEN RAISE EXCEPTION 'A revenue source does not conserve its exact allocation'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER conserve_financial_close AFTER INSERT ON booking_financial_close DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_booking_revenue_conservation();
CREATE CONSTRAINT TRIGGER conserve_revenue_entry AFTER INSERT ON booking_revenue_entry DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_booking_revenue_conservation();
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['booking_settlement_command','booking_settlement','booking_settlement_decision','booking_settlement_payment_attempt','booking_financial_close','booking_revenue_entry'] LOOP
 EXECUTE format('CREATE TRIGGER immutable_%I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION app_immutable()',t,t);
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN EXECUTE format('GRANT SELECT,INSERT ON %I TO rent2go_app',t); END IF;
END LOOP; END $$;
