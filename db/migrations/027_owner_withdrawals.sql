CREATE TABLE owner_account (
 id uuid PRIMARY KEY,agency_id uuid NOT NULL REFERENCES agency(id),owner_id text NOT NULL REFERENCES app_actor(id),environment text NOT NULL CHECK(environment IN ('MANUAL','DEMO')),version integer NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(agency_id,owner_id,environment)
);
CREATE TABLE owner_withdrawal_command (
 id uuid PRIMARY KEY,account_id uuid NOT NULL REFERENCES owner_account(id),actor_id text NOT NULL REFERENCES app_actor(id),idempotency_key uuid NOT NULL,digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(account_id,actor_id,idempotency_key)
);
CREATE TABLE owner_withdrawal (
 id uuid PRIMARY KEY,account_id uuid NOT NULL REFERENCES owner_account(id),actor_id text NOT NULL REFERENCES app_actor(id),amount_centavos bigint NOT NULL CHECK(amount_centavos BETWEEN 1 AND 9007199254740991),method text NOT NULL CHECK(method IN ('CASH','GCASH','DEMO_GCASH','DEMO_PAYPAL')),destination jsonb NOT NULL CHECK(jsonb_typeof(destination)='object'),reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(id,account_id),UNIQUE(id,account_id,amount_centavos)
);
CREATE TABLE owner_withdrawal_decision (
 id uuid PRIMARY KEY,withdrawal_id uuid NOT NULL UNIQUE,account_id uuid NOT NULL,actor_id text NOT NULL REFERENCES app_actor(id),decision text NOT NULL CHECK(decision IN ('APPROVE','REJECT')),reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(withdrawal_id,account_id) REFERENCES owner_withdrawal(id,account_id)
);
CREATE TABLE owner_withdrawal_cancel (
 id uuid PRIMARY KEY,withdrawal_id uuid NOT NULL UNIQUE,account_id uuid NOT NULL,actor_id text NOT NULL REFERENCES app_actor(id),action text NOT NULL CHECK(action IN ('WITHDRAW','REVOKE')),reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(withdrawal_id,account_id) REFERENCES owner_withdrawal(id,account_id)
);
CREATE TABLE owner_payout_attempt (
 id uuid PRIMARY KEY,withdrawal_id uuid NOT NULL,account_id uuid NOT NULL,actor_id text NOT NULL REFERENCES app_actor(id),initial_outcome text NOT NULL CHECK(initial_outcome IN ('SUCCEEDED','FAILED','PENDING','CANCELLED')),reference text NOT NULL CHECK(length(trim(reference)) BETWEEN 1 AND 160),note text NOT NULL CHECK(length(trim(note)) BETWEEN 1 AND 2000),file_id uuid UNIQUE,mime text,size_bytes integer,sha256 text,backend text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(withdrawal_id,account_id) REFERENCES owner_withdrawal(id,account_id),UNIQUE(id,withdrawal_id,account_id),CHECK((file_id IS NULL AND mime IS NULL AND size_bytes IS NULL AND sha256 IS NULL AND backend IS NULL) OR (file_id IS NOT NULL AND mime IN ('image/png','image/jpeg','application/pdf') AND size_bytes BETWEEN 1 AND 5242880 AND sha256 ~ '^[a-f0-9]{64}$' AND backend IN ('local','s3') AND initial_outcome='SUCCEEDED'))
);
CREATE TABLE owner_payout_resolution (
 id uuid PRIMARY KEY,attempt_id uuid NOT NULL UNIQUE,withdrawal_id uuid NOT NULL,account_id uuid NOT NULL,actor_id text NOT NULL REFERENCES app_actor(id),outcome text NOT NULL CHECK(outcome IN ('SUCCEEDED','FAILED','CANCELLED')),reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(attempt_id,withdrawal_id,account_id) REFERENCES owner_payout_attempt(id,withdrawal_id,account_id)
);
CREATE TABLE owner_payout (
 id uuid PRIMARY KEY,withdrawal_id uuid NOT NULL UNIQUE,account_id uuid NOT NULL,attempt_id uuid NOT NULL UNIQUE,agency_id uuid NOT NULL REFERENCES agency(id),environment text NOT NULL CHECK(environment IN ('MANUAL','DEMO')),method text NOT NULL,amount_centavos bigint NOT NULL,reference text NOT NULL,normalized_reference text NOT NULL,body jsonb NOT NULL CHECK(jsonb_typeof(body)='object'),digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(withdrawal_id,account_id,amount_centavos) REFERENCES owner_withdrawal(id,account_id,amount_centavos),FOREIGN KEY(attempt_id,withdrawal_id,account_id) REFERENCES owner_payout_attempt(id,withdrawal_id,account_id),UNIQUE(agency_id,environment,method,normalized_reference),UNIQUE(id,account_id,withdrawal_id)
);
CREATE TABLE owner_account_entry (
 id uuid PRIMARY KEY,account_id uuid NOT NULL,withdrawal_id uuid NOT NULL,payout_id uuid NOT NULL UNIQUE,amount_centavos bigint NOT NULL CHECK(amount_centavos BETWEEN -9007199254740991 AND -1),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(payout_id,account_id,withdrawal_id) REFERENCES owner_payout(id,account_id,withdrawal_id)
);
CREATE TABLE finance_notification (
 id uuid PRIMARY KEY,recipient_id text NOT NULL REFERENCES app_actor(id),account_id uuid NOT NULL REFERENCES owner_account(id),message text NOT NULL CHECK(length(message) BETWEEN 1 AND 1000),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),read_at timestamptz
);
CREATE INDEX owner_withdrawal_history ON owner_withdrawal(account_id,created_at DESC,id DESC);
CREATE INDEX owner_payout_attempt_history ON owner_payout_attempt(withdrawal_id,created_at DESC,id DESC);
CREATE INDEX finance_notification_recipient ON finance_notification(recipient_id,created_at DESC,id DESC);
CREATE FUNCTION owner_account_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'version')<>(to_jsonb(OLD)-'version') OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Owner account identity is immutable and versions advance once'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER protect_owner_account BEFORE UPDATE OR DELETE ON owner_account FOR EACH ROW EXECUTE FUNCTION owner_account_identity_guard();
CREATE FUNCTION owner_payout_conservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE payout_key uuid; expected bigint; debit numeric; a owner_account; p owner_payout; w owner_withdrawal;
BEGIN
 IF TG_TABLE_NAME='owner_payout' THEN payout_key:=NEW.id; ELSE payout_key:=NEW.payout_id; END IF;
 SELECT * INTO p FROM owner_payout WHERE id=payout_key;
 SELECT * INTO a FROM owner_account WHERE id=p.account_id;
 SELECT * INTO w FROM owner_withdrawal WHERE id=p.withdrawal_id;
 SELECT COALESCE(sum(amount_centavos),0) INTO debit FROM owner_account_entry WHERE payout_id=payout_key;
 IF p.id IS NULL OR debit<>-p.amount_centavos OR p.agency_id<>a.agency_id OR p.environment<>a.environment OR p.method<>w.method OR (p.environment='DEMO')<>(p.method LIKE 'DEMO_%') THEN RAISE EXCEPTION 'Owner payout does not conserve its exact account debit'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER conserve_owner_payout AFTER INSERT ON owner_payout DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION owner_payout_conservation();
CREATE CONSTRAINT TRIGGER conserve_owner_debit AFTER INSERT ON owner_account_entry DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION owner_payout_conservation();
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['owner_withdrawal_command','owner_withdrawal','owner_withdrawal_decision','owner_withdrawal_cancel','owner_payout_attempt','owner_payout_resolution','owner_payout','owner_account_entry'] LOOP
 EXECUTE format('CREATE TRIGGER immutable_%I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION app_immutable()',t,t);
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN EXECUTE format('GRANT SELECT,INSERT ON %I TO rent2go_app',t); END IF;
END LOOP;
IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN GRANT SELECT,INSERT ON owner_account,finance_notification TO rent2go_app; GRANT UPDATE(version) ON owner_account TO rent2go_app; GRANT UPDATE(read_at) ON finance_notification TO rent2go_app; END IF;
END $$;
