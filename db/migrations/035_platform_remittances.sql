-- Source-based platform dues. Accepted agency credits never silently net invoices.
CREATE TABLE platform_account (
 id uuid PRIMARY KEY,agency_id uuid NOT NULL REFERENCES agency(id),environment text NOT NULL CHECK(environment IN('MANUAL','DEMO')),version integer NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(agency_id,environment),UNIQUE(id,agency_id,environment)
);
CREATE TABLE platform_remittance_command (
 id uuid PRIMARY KEY,account_id uuid NOT NULL REFERENCES platform_account(id),actor_id text NOT NULL REFERENCES app_actor(id),idempotency_key uuid NOT NULL,action text NOT NULL,digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(account_id,actor_id,idempotency_key)
);
CREATE TABLE platform_remittance (
 id uuid PRIMARY KEY,account_id uuid NOT NULL,agency_id uuid NOT NULL,environment text NOT NULL,actor_id text NOT NULL REFERENCES app_actor(id),method text NOT NULL CHECK(method IN('CASH','GCASH','DEMO_CARD','DEMO_GCASH','DEMO_PAYPAL')),amount_centavos bigint NOT NULL CHECK(amount_centavos BETWEEN 1 AND 9007199254740991),reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),body jsonb NOT NULL CHECK(jsonb_typeof(body)='object'),digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(account_id,agency_id,environment) REFERENCES platform_account(id,agency_id,environment),CHECK((environment='MANUAL' AND method IN('CASH','GCASH')) OR (environment='DEMO' AND method IN('DEMO_CARD','DEMO_GCASH','DEMO_PAYPAL'))),UNIQUE(id,account_id),UNIQUE(id,account_id,agency_id,environment,method,amount_centavos)
);
CREATE INDEX remittance_account_history ON platform_remittance(account_id,created_at DESC,id DESC);
CREATE TABLE platform_remittance_source (
 remittance_id uuid NOT NULL REFERENCES platform_remittance(id),entry_id uuid NOT NULL REFERENCES booking_revenue_entry(id),amount_centavos bigint NOT NULL CHECK(amount_centavos BETWEEN 1 AND 9007199254740991),PRIMARY KEY(remittance_id,entry_id)
);
CREATE INDEX remittance_original_source ON platform_remittance_source(entry_id);
CREATE TABLE platform_remittance_cancel (
 remittance_id uuid PRIMARY KEY REFERENCES platform_remittance(id),actor_id text NOT NULL REFERENCES app_actor(id),action text NOT NULL CHECK(action IN('WITHDRAW','REVOKE')),reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE platform_remittance_attempt (
 id uuid PRIMARY KEY,remittance_id uuid NOT NULL,account_id uuid NOT NULL,actor_id text NOT NULL REFERENCES app_actor(id),command_id uuid NOT NULL UNIQUE REFERENCES platform_remittance_command(id),initial_outcome text NOT NULL CHECK(initial_outcome IN('SUBMITTED','CONFIRMED','PENDING','DECLINED','CANCELLED')),reference text NOT NULL CHECK(length(trim(reference)) BETWEEN 3 AND 160),note text NOT NULL CHECK(length(trim(note)) BETWEEN 1 AND 2000),file_id uuid UNIQUE,mime text,size_bytes integer,sha256 text,backend text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(remittance_id,account_id) REFERENCES platform_remittance(id,account_id),UNIQUE(id,remittance_id,account_id),CHECK((file_id IS NULL AND mime IS NULL AND size_bytes IS NULL AND sha256 IS NULL AND backend IS NULL) OR (file_id IS NOT NULL AND mime IN('image/png','image/jpeg','application/pdf') AND size_bytes BETWEEN 1 AND 5242880 AND sha256 ~ '^[a-f0-9]{64}$' AND backend IN('s3','local')))
);
CREATE TABLE platform_remittance_review (
 id uuid PRIMARY KEY,attempt_id uuid NOT NULL UNIQUE,remittance_id uuid NOT NULL,account_id uuid NOT NULL,actor_id text NOT NULL REFERENCES app_actor(id),decision text NOT NULL CHECK(decision IN('ACCEPT','REJECT')),external_received boolean NOT NULL,reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(attempt_id,remittance_id,account_id) REFERENCES platform_remittance_attempt(id,remittance_id,account_id),CHECK(external_received=(decision='ACCEPT'))
);
CREATE TABLE platform_remittance_resolution (
 id uuid PRIMARY KEY,attempt_id uuid NOT NULL UNIQUE,remittance_id uuid NOT NULL,account_id uuid NOT NULL,actor_id text NOT NULL REFERENCES app_actor(id),outcome text NOT NULL CHECK(outcome IN('CONFIRMED','DECLINED','CANCELLED')),reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(attempt_id,remittance_id,account_id) REFERENCES platform_remittance_attempt(id,remittance_id,account_id)
);
CREATE TABLE platform_remittance_receipt (
 id uuid PRIMARY KEY,remittance_id uuid NOT NULL UNIQUE,attempt_id uuid NOT NULL UNIQUE,account_id uuid NOT NULL,agency_id uuid NOT NULL,environment text NOT NULL,method text NOT NULL,amount_centavos bigint NOT NULL CHECK(amount_centavos>0),actor_id text NOT NULL REFERENCES app_actor(id),reference text NOT NULL CHECK(length(trim(reference)) BETWEEN 3 AND 160),normalized_reference text NOT NULL CHECK(length(normalized_reference) BETWEEN 3 AND 160),body jsonb NOT NULL CHECK(jsonb_typeof(body)='object'),digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(remittance_id,account_id,agency_id,environment,method,amount_centavos) REFERENCES platform_remittance(id,account_id,agency_id,environment,method,amount_centavos),FOREIGN KEY(attempt_id,remittance_id,account_id) REFERENCES platform_remittance_attempt(id,remittance_id,account_id),UNIQUE(id,method,normalized_reference)
);
CREATE INDEX remittance_receipt_period ON platform_remittance_receipt(agency_id,environment,created_at DESC);
CREATE TABLE platform_incoming_reference (
 method text NOT NULL CHECK(method IN('CASH','GCASH')),normalized_reference text NOT NULL CHECK(length(normalized_reference) BETWEEN 3 AND 160),receipt_id uuid NOT NULL UNIQUE,PRIMARY KEY(method,normalized_reference),FOREIGN KEY(receipt_id,method,normalized_reference) REFERENCES platform_remittance_receipt(id,method,normalized_reference)
);
CREATE TABLE platform_agency_credit (
 id uuid PRIMARY KEY,account_id uuid NOT NULL REFERENCES platform_account(id),entry_id uuid NOT NULL REFERENCES booking_revenue_entry(id),amount_centavos bigint NOT NULL CHECK(amount_centavos BETWEEN 1 AND 9007199254740991),actor_id text NOT NULL REFERENCES app_actor(id),consent boolean NOT NULL CHECK(consent),body jsonb NOT NULL CHECK(jsonb_typeof(body)='object'),digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(id,account_id)
);
CREATE INDEX agency_credit_original ON platform_agency_credit(entry_id);
CREATE INDEX agency_credit_account ON platform_agency_credit(account_id,created_at,id);
CREATE TABLE platform_credit_application (
 id uuid PRIMARY KEY,account_id uuid NOT NULL REFERENCES platform_account(id),actor_id text NOT NULL REFERENCES app_actor(id),amount_centavos bigint NOT NULL CHECK(amount_centavos BETWEEN 1 AND 9007199254740991),body jsonb NOT NULL CHECK(jsonb_typeof(body)='object'),digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE platform_credit_use (
 application_id uuid NOT NULL REFERENCES platform_credit_application(id),credit_id uuid NOT NULL REFERENCES platform_agency_credit(id),amount_centavos bigint NOT NULL CHECK(amount_centavos BETWEEN 1 AND 9007199254740991),PRIMARY KEY(application_id,credit_id)
);
CREATE INDEX platform_credit_usage ON platform_credit_use(credit_id);
CREATE TABLE platform_credit_allocation (
 application_id uuid NOT NULL REFERENCES platform_credit_application(id),entry_id uuid NOT NULL REFERENCES booking_revenue_entry(id),amount_centavos bigint NOT NULL CHECK(amount_centavos BETWEEN 1 AND 9007199254740991),PRIMARY KEY(application_id,entry_id)
);
CREATE INDEX platform_offset_original ON platform_credit_allocation(entry_id);
CREATE TABLE remittance_notification (
 id uuid PRIMARY KEY,account_id uuid NOT NULL REFERENCES platform_account(id),recipient_id text NOT NULL REFERENCES app_actor(id),message text NOT NULL CHECK(length(message) BETWEEN 1 AND 1000),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX remittance_notification_recipient ON remittance_notification(recipient_id,created_at DESC,id DESC);

CREATE FUNCTION platform_source_facts(source uuid) RETURNS TABLE(agency_id uuid,environment text,original bigint,credits numeric,paid numeric,applied numeric,reserved numeric,granted numeric) LANGUAGE sql VOLATILE AS $$
 SELECT e.agency_id,e.environment,e.amount_centavos,
 COALESCE((SELECT sum(x.amount_centavos) FROM booking_revenue_credit x WHERE x.entry_id=e.id),0),
 COALESCE((SELECT sum(s.amount_centavos) FROM platform_remittance_source s JOIN platform_remittance_receipt p ON p.remittance_id=s.remittance_id WHERE s.entry_id=e.id),0),
 COALESCE((SELECT sum(s.amount_centavos) FROM platform_credit_allocation s WHERE s.entry_id=e.id),0),
 COALESCE((SELECT sum(s.amount_centavos) FROM platform_remittance_source s WHERE s.entry_id=e.id AND NOT EXISTS(SELECT 1 FROM platform_remittance_receipt p WHERE p.remittance_id=s.remittance_id) AND NOT EXISTS(SELECT 1 FROM platform_remittance_cancel x WHERE x.remittance_id=s.remittance_id)),0),
 COALESCE((SELECT sum(g.amount_centavos) FROM platform_agency_credit g WHERE g.entry_id=e.id),0)
 FROM booking_revenue_entry e WHERE e.id=source AND e.recipient='PLATFORM'
$$;
CREATE FUNCTION guard_platform_account() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'version')<>(to_jsonb(OLD)-'version') OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Platform account identity is immutable; version must advance'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER protect_platform_account BEFORE UPDATE OR DELETE ON platform_account FOR EACH ROW EXECUTE FUNCTION guard_platform_account();

CREATE FUNCTION platform_agency_operator(person text,account uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM platform_account a JOIN agency g ON g.id=a.agency_id JOIN app_actor u ON u.id=person WHERE a.id=account AND NOT u.suspended AND NOT u.is_test_fixture AND (g.owner_id=u.id OR EXISTS(SELECT 1 FROM agency_member m WHERE m.agency_id=g.id AND m.actor_id=u.id AND m.active)))
$$;
CREATE FUNCTION platform_independent_reviewer(person text,account uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM app_actor u WHERE u.id=person AND u.role='SUPER_ADMIN' AND NOT u.suspended AND NOT u.is_test_fixture) AND NOT platform_agency_operator(person,account)
$$;
CREATE FUNCTION guard_remittance_parties() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE key uuid; remit platform_remittance%ROWTYPE; attempt platform_remittance_attempt%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='platform_remittance_cancel' THEN SELECT account_id INTO STRICT key FROM platform_remittance WHERE id=NEW.remittance_id; ELSE key:=NEW.account_id; END IF;
 PERFORM id FROM platform_account WHERE id=key FOR UPDATE;
 IF TG_TABLE_NAME IN('platform_remittance','platform_agency_credit','platform_credit_application') THEN
  IF NOT platform_agency_operator(NEW.actor_id,key) THEN RAISE EXCEPTION 'Exact agency authority is required for this remittance action' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='platform_remittance_attempt' THEN
  SELECT * INTO STRICT remit FROM platform_remittance WHERE id=NEW.remittance_id;
  IF NOT platform_agency_operator(NEW.actor_id,key) OR NOT EXISTS(SELECT 1 FROM platform_remittance_command c WHERE c.id=NEW.command_id AND c.account_id=key AND c.actor_id=NEW.actor_id) OR EXISTS(SELECT 1 FROM platform_remittance_receipt p WHERE p.remittance_id=remit.id) OR EXISTS(SELECT 1 FROM platform_remittance_cancel x WHERE x.remittance_id=remit.id) THEN RAISE EXCEPTION 'Only an unpaid agency remittance may receive a payment attempt' USING ERRCODE='23514'; END IF;
  IF (remit.environment='MANUAL' AND (NEW.initial_outcome<>'SUBMITTED' OR NEW.file_id IS NULL)) OR (remit.environment='DEMO' AND (NEW.initial_outcome='SUBMITTED' OR NEW.file_id IS NOT NULL)) THEN RAISE EXCEPTION 'Payment claims must match their actual or simulated environment' USING ERRCODE='23514'; END IF;
  IF (SELECT count(*) FROM platform_remittance_attempt t WHERE t.remittance_id=remit.id)>=30 OR EXISTS(SELECT 1 FROM platform_remittance_attempt t WHERE t.remittance_id=remit.id AND ((t.initial_outcome='SUBMITTED' AND NOT EXISTS(SELECT 1 FROM platform_remittance_review d WHERE d.attempt_id=t.id)) OR (t.initial_outcome='PENDING' AND NOT EXISTS(SELECT 1 FROM platform_remittance_resolution z WHERE z.attempt_id=t.id)))) THEN RAISE EXCEPTION 'Resolve the pending claim or result before another attempt' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME IN('platform_remittance_review','platform_remittance_resolution') THEN
  IF NOT platform_independent_reviewer(NEW.actor_id,key) THEN RAISE EXCEPTION 'Independent platform review is required' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT attempt FROM platform_remittance_attempt WHERE id=NEW.attempt_id;
  SELECT * INTO STRICT remit FROM platform_remittance WHERE id=attempt.remittance_id;
  IF EXISTS(SELECT 1 FROM platform_remittance_receipt p WHERE p.remittance_id=remit.id) OR EXISTS(SELECT 1 FROM platform_remittance_cancel x WHERE x.remittance_id=remit.id) OR (TG_TABLE_NAME='platform_remittance_review' AND (remit.environment<>'MANUAL' OR attempt.initial_outcome<>'SUBMITTED' OR attempt.file_id IS NULL)) OR (TG_TABLE_NAME='platform_remittance_resolution' AND (remit.environment<>'DEMO' OR attempt.initial_outcome<>'PENDING')) THEN RAISE EXCEPTION 'Review only the exact pending payment claim or result' USING ERRCODE='23514'; END IF;
 ELSE
  IF (NEW.action='WITHDRAW' AND NOT platform_agency_operator(NEW.actor_id,key)) OR (NEW.action='REVOKE' AND NOT platform_independent_reviewer(NEW.actor_id,key)) OR EXISTS(SELECT 1 FROM platform_remittance_receipt p WHERE p.remittance_id=NEW.remittance_id) OR EXISTS(SELECT 1 FROM platform_remittance_attempt t WHERE t.remittance_id=NEW.remittance_id AND ((t.initial_outcome='SUBMITTED' AND NOT EXISTS(SELECT 1 FROM platform_remittance_review d WHERE d.attempt_id=t.id)) OR (t.initial_outcome='PENDING' AND NOT EXISTS(SELECT 1 FROM platform_remittance_resolution z WHERE z.attempt_id=t.id)))) THEN RAISE EXCEPTION 'Resolve pending outcomes before cancelling an unpaid remittance' USING ERRCODE='23514'; END IF;
 END IF;RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['platform_remittance','platform_remittance_attempt','platform_remittance_review','platform_remittance_resolution','platform_remittance_cancel','platform_agency_credit','platform_credit_application'] LOOP
 EXECUTE format('CREATE TRIGGER parties_%I BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION guard_remittance_parties()',t,t);
END LOOP; END $$;

-- Each new allocation checks capacity while holding the same account lock used by
-- credit posting. Existing paid sources may become excess only through later credits.
CREATE FUNCTION guard_platform_funding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE account platform_account%ROWTYPE; facts record; source uuid; amount numeric; used numeric; remit platform_remittance%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='platform_remittance_source' THEN
  SELECT * INTO STRICT remit FROM platform_remittance WHERE id=NEW.remittance_id;
  SELECT * INTO STRICT account FROM platform_account WHERE id=remit.account_id FOR UPDATE;
  source:=NEW.entry_id;amount:=NEW.amount_centavos;
 ELSIF TG_TABLE_NAME='platform_credit_allocation' THEN
  SELECT a.* INTO STRICT account FROM platform_account a JOIN platform_credit_application x ON x.account_id=a.id WHERE x.id=NEW.application_id FOR UPDATE OF a;
  source:=NEW.entry_id;amount:=NEW.amount_centavos;
 ELSIF TG_TABLE_NAME='platform_agency_credit' THEN
  SELECT * INTO STRICT account FROM platform_account WHERE id=NEW.account_id FOR UPDATE;
  source:=NEW.entry_id;amount:=NEW.amount_centavos;
 ELSIF TG_TABLE_NAME='platform_credit_use' THEN
  SELECT a.* INTO STRICT account FROM platform_account a JOIN platform_credit_application x ON x.account_id=a.id WHERE x.id=NEW.application_id FOR UPDATE OF a;
  SELECT g.amount_centavos-COALESCE((SELECT sum(u.amount_centavos) FROM platform_credit_use u WHERE u.credit_id=g.id),0) INTO used FROM platform_agency_credit g WHERE g.id=NEW.credit_id AND g.account_id=account.id;
  IF used IS NULL OR NEW.amount_centavos>used THEN RAISE EXCEPTION 'Accepted agency credit is unavailable' USING ERRCODE='23514'; END IF;RETURN NEW;
 ELSE
  SELECT * INTO STRICT account FROM platform_account WHERE id=NEW.account_id FOR UPDATE;
  FOR source,amount IN SELECT s.entry_id,s.amount_centavos FROM platform_remittance_source s WHERE s.remittance_id=NEW.remittance_id LOOP
   SELECT * INTO STRICT facts FROM platform_source_facts(source);
   IF amount>facts.original-facts.credits-facts.paid-facts.applied-facts.reserved+amount THEN RAISE EXCEPTION 'Receipt exceeds its reserved original source' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF NOT FOUND THEN RAISE EXCEPTION 'A remittance receipt requires disclosed source allocations' USING ERRCODE='23514'; END IF;RETURN NEW;
 END IF;
 SELECT * INTO facts FROM platform_source_facts(source);
 IF NOT FOUND OR facts.agency_id<>account.agency_id OR facts.environment<>account.environment THEN RAISE EXCEPTION 'Platform source must belong to this agency and payment environment' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='platform_agency_credit' THEN
  IF amount>GREATEST(facts.paid+facts.applied-(facts.original-facts.credits),0)-facts.granted THEN RAISE EXCEPTION 'Agency credit exceeds unaccepted excess on the original source' USING ERRCODE='23514'; END IF;
 ELSIF amount>GREATEST(facts.original-facts.credits-facts.paid-facts.applied,0)-facts.reserved THEN RAISE EXCEPTION 'Platform source capacity is already settled or reserved' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fund_remittance_source BEFORE INSERT ON platform_remittance_source FOR EACH ROW EXECUTE FUNCTION guard_platform_funding();
CREATE TRIGGER fund_credit_allocation BEFORE INSERT ON platform_credit_allocation FOR EACH ROW EXECUTE FUNCTION guard_platform_funding();
CREATE TRIGGER fund_agency_credit BEFORE INSERT ON platform_agency_credit FOR EACH ROW EXECUTE FUNCTION guard_platform_funding();
CREATE TRIGGER fund_credit_use BEFORE INSERT ON platform_credit_use FOR EACH ROW EXECUTE FUNCTION guard_platform_funding();
CREATE TRIGGER fund_remittance_receipt BEFORE INSERT ON platform_remittance_receipt FOR EACH ROW EXECUTE FUNCTION guard_platform_funding();

CREATE FUNCTION protect_reserved_platform_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original booking_revenue_entry%ROWTYPE; account uuid; facts record;
BEGIN
 SELECT * INTO STRICT original FROM booking_revenue_entry WHERE id=NEW.entry_id;
 IF original.recipient<>'PLATFORM' OR NEW.amount_centavos=0 THEN RETURN NEW; END IF;
 INSERT INTO platform_account(id,agency_id,environment)VALUES(gen_random_uuid(),original.agency_id,original.environment) ON CONFLICT(agency_id,environment) DO NOTHING;
 SELECT id INTO STRICT account FROM platform_account WHERE agency_id=original.agency_id AND environment=original.environment FOR UPDATE;
 SELECT * INTO STRICT facts FROM platform_source_facts(NEW.entry_id);
 IF facts.reserved>GREATEST(facts.original-facts.credits-NEW.amount_centavos-facts.paid-facts.applied,0) THEN RAISE EXCEPTION 'Resolve pending remittance reservations before posting this platform reduction' USING ERRCODE='23514'; END IF;
 UPDATE platform_account SET version=version+1 WHERE id=account;RETURN NEW;
END $$;
CREATE TRIGGER preserve_platform_reservations BEFORE INSERT ON booking_revenue_credit FOR EACH ROW EXECUTE FUNCTION protect_reserved_platform_source();

CREATE FUNCTION conserve_platform_records() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE key uuid; account platform_account%ROWTYPE; source record;
BEGIN
 IF TG_TABLE_NAME IN('platform_remittance_source','platform_remittance_cancel') THEN SELECT account_id INTO key FROM platform_remittance WHERE id=NEW.remittance_id;
 ELSIF TG_TABLE_NAME IN('platform_credit_use','platform_credit_allocation') THEN SELECT account_id INTO key FROM platform_credit_application WHERE id=NEW.application_id;
 ELSE key:=NEW.account_id; END IF;
 SELECT * INTO STRICT account FROM platform_account WHERE id=key FOR UPDATE;
 IF EXISTS(SELECT 1 FROM platform_remittance r LEFT JOIN platform_remittance_source s ON s.remittance_id=r.id WHERE r.account_id=key GROUP BY r.id,r.amount_centavos HAVING count(s.entry_id) NOT BETWEEN 1 AND 20 OR COALESCE(sum(s.amount_centavos),0)<>r.amount_centavos) THEN RAISE EXCEPTION 'Remittance must conserve its exact disclosed original sources'; END IF;
 IF EXISTS(SELECT 1 FROM platform_credit_application x WHERE x.account_id=key AND ((SELECT COALESCE(sum(amount_centavos),0) FROM platform_credit_use WHERE application_id=x.id)<>x.amount_centavos OR (SELECT COALESCE(sum(amount_centavos),0) FROM platform_credit_allocation WHERE application_id=x.id)<>x.amount_centavos OR (SELECT count(*) FROM platform_credit_use WHERE application_id=x.id) NOT BETWEEN 1 AND 20 OR (SELECT count(*) FROM platform_credit_allocation WHERE application_id=x.id) NOT BETWEEN 1 AND 20)) THEN RAISE EXCEPTION 'Agency credit applications must conserve both accepted credits and target sources'; END IF;
 IF EXISTS(SELECT 1 FROM platform_credit_use u JOIN platform_credit_application x ON x.id=u.application_id JOIN platform_agency_credit g ON g.id=u.credit_id WHERE x.account_id=key AND g.account_id<>key) THEN RAISE EXCEPTION 'Agency credit cannot cross accounts'; END IF;
 IF EXISTS(SELECT 1 FROM platform_agency_credit g WHERE g.account_id=key AND (SELECT COALESCE(sum(amount_centavos),0) FROM platform_credit_use WHERE credit_id=g.id)>g.amount_centavos) THEN RAISE EXCEPTION 'Accepted agency credit is over-consumed'; END IF;
 FOR source IN SELECT f.* FROM booking_revenue_entry e CROSS JOIN LATERAL platform_source_facts(e.id) f WHERE e.agency_id=account.agency_id AND e.environment=account.environment AND e.recipient='PLATFORM' LOOP
  IF source.credits>source.original OR source.paid+source.applied>source.original OR source.reserved>GREATEST(source.original-source.credits-source.paid-source.applied,0) OR source.granted>GREATEST(source.paid+source.applied-(source.original-source.credits),0) THEN RAISE EXCEPTION 'Platform original source and accepted credit balances do not conserve'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM platform_remittance_receipt p JOIN platform_remittance_attempt t ON t.id=p.attempt_id WHERE p.account_id=key AND (p.reference<>t.reference OR EXISTS(SELECT 1 FROM platform_remittance_cancel x WHERE x.remittance_id=p.remittance_id) OR (p.environment='MANUAL' AND (t.initial_outcome<>'SUBMITTED' OR t.file_id IS NULL OR NOT EXISTS(SELECT 1 FROM platform_remittance_review d WHERE d.attempt_id=t.id AND d.decision='ACCEPT' AND d.external_received AND d.actor_id=p.actor_id) OR NOT EXISTS(SELECT 1 FROM platform_incoming_reference ref WHERE ref.receipt_id=p.id AND ref.method=p.method))) OR (p.environment='DEMO' AND NOT((t.initial_outcome='CONFIRMED' AND p.actor_id=t.actor_id) OR EXISTS(SELECT 1 FROM platform_remittance_resolution z WHERE z.attempt_id=t.id AND z.outcome='CONFIRMED' AND z.actor_id=p.actor_id))))) THEN RAISE EXCEPTION 'Remittance receipt requires its exact confirmed source outcome'; END IF;
 IF EXISTS(SELECT 1 FROM platform_remittance_attempt t WHERE t.account_id=key AND (t.initial_outcome='CONFIRMED' OR EXISTS(SELECT 1 FROM platform_remittance_review d WHERE d.attempt_id=t.id AND d.decision='ACCEPT') OR EXISTS(SELECT 1 FROM platform_remittance_resolution z WHERE z.attempt_id=t.id AND z.outcome='CONFIRMED')) AND NOT EXISTS(SELECT 1 FROM platform_remittance_receipt p WHERE p.attempt_id=t.id)) THEN RAISE EXCEPTION 'A confirmed remittance outcome must create its exact receipt'; END IF;
 RETURN NULL;
END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['platform_remittance','platform_remittance_source','platform_remittance_cancel','platform_remittance_attempt','platform_remittance_review','platform_remittance_resolution','platform_remittance_receipt','platform_agency_credit','platform_credit_application','platform_credit_use','platform_credit_allocation'] LOOP
 EXECUTE format('CREATE CONSTRAINT TRIGGER conserve_%I AFTER INSERT ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION conserve_platform_records()',t,t);
END LOOP; END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['platform_remittance_command','platform_remittance','platform_remittance_source','platform_remittance_cancel','platform_remittance_attempt','platform_remittance_review','platform_remittance_resolution','platform_remittance_receipt','platform_incoming_reference','platform_agency_credit','platform_credit_application','platform_credit_use','platform_credit_allocation','remittance_notification'] LOOP
 EXECUTE format('CREATE TRIGGER immutable_%I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION app_immutable()',t,t);
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN EXECUTE format('GRANT SELECT,INSERT ON %I TO rent2go_app',t); END IF;
END LOOP; END $$;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN GRANT SELECT,INSERT ON platform_account TO rent2go_app;GRANT UPDATE(version) ON platform_account TO rent2go_app; END IF; END $$;

ALTER TABLE notification_read_receipt DROP CONSTRAINT notification_read_receipt_source_check;
ALTER TABLE notification_read_receipt ADD CONSTRAINT notification_read_receipt_source_check CHECK(source IN('PARTNER','BOOKING','FINANCE','VEHICLE','REMITTANCE'));
CREATE OR REPLACE FUNCTION notification_receipt_identity() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE recipient text; BEGIN
 CASE NEW.source WHEN 'PARTNER' THEN SELECT recipient_id INTO recipient FROM app_notification WHERE id=NEW.notification_id;
 WHEN 'BOOKING' THEN SELECT recipient_id INTO recipient FROM booking_notification WHERE id=NEW.notification_id;
 WHEN 'FINANCE' THEN SELECT recipient_id INTO recipient FROM finance_notification WHERE id=NEW.notification_id;
 WHEN 'VEHICLE' THEN SELECT recipient_id INTO recipient FROM vehicle_notification WHERE id=NEW.notification_id;
 WHEN 'REMITTANCE' THEN SELECT recipient_id INTO recipient FROM remittance_notification WHERE id=NEW.notification_id;
 ELSE RAISE EXCEPTION 'Unknown notification source'; END CASE;
 IF recipient IS DISTINCT FROM NEW.recipient_id THEN RAISE EXCEPTION 'Read receipt must belong to the delivered recipient'; END IF;RETURN NEW;
END $$;
ALTER TABLE email_message DROP CONSTRAINT email_message_source_check;
ALTER TABLE email_message ADD CONSTRAINT email_message_source_check CHECK(source IN('PARTNER','BOOKING','FINANCE','VEHICLE','REMITTANCE'));
CREATE OR REPLACE FUNCTION email_source_recipient(kind text,notification uuid) RETURNS text LANGUAGE plpgsql STABLE AS $$ DECLARE recipient text; BEGIN
 CASE kind WHEN 'PARTNER' THEN SELECT recipient_id INTO recipient FROM app_notification WHERE id=notification;
 WHEN 'BOOKING' THEN SELECT recipient_id INTO recipient FROM booking_notification WHERE id=notification;
 WHEN 'FINANCE' THEN SELECT recipient_id INTO recipient FROM finance_notification WHERE id=notification;
 WHEN 'VEHICLE' THEN SELECT recipient_id INTO recipient FROM vehicle_notification WHERE id=notification;
 WHEN 'REMITTANCE' THEN SELECT recipient_id INTO recipient FROM remittance_notification WHERE id=notification;
 ELSE RETURN NULL; END CASE;RETURN recipient;
END $$;
CREATE OR REPLACE FUNCTION enqueue_email_update() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE message uuid:=gen_random_uuid();kind text; BEGIN
 kind:=CASE TG_TABLE_NAME WHEN 'app_notification' THEN 'PARTNER' WHEN 'booking_notification' THEN 'BOOKING' WHEN 'finance_notification' THEN 'FINANCE' WHEN 'vehicle_notification' THEN 'VEHICLE' WHEN 'remittance_notification' THEN 'REMITTANCE' END;
 IF kind IS NULL THEN RAISE EXCEPTION 'Unknown email notification source'; END IF;
 INSERT INTO email_message(id,source,notification_id,recipient_id,email,preference_version)
 SELECT message,kind,NEW.id,p.actor_id,p.email,p.version FROM email_preference p JOIN app_actor a ON a.id=p.actor_id
 WHERE p.actor_id=NEW.recipient_id AND p.enabled AND NOT a.suspended AND NOT a.is_test_fixture AND lower(a.email)=lower(p.email) AND NEW.created_at>=p.updated_at;
 IF FOUND THEN INSERT INTO email_attempt(id,message_id,ordinal,request_key)VALUES(gen_random_uuid(),message,1,gen_random_uuid()); END IF;RETURN NEW;
END $$;
CREATE TRIGGER enqueue_remittance_email AFTER INSERT ON remittance_notification FOR EACH ROW EXECUTE FUNCTION enqueue_email_update();
