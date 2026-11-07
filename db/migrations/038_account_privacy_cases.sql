ALTER TABLE app_actor ADD COLUMN governance_version integer NOT NULL DEFAULT 1 CHECK(governance_version>0);
CREATE FUNCTION advance_actor_governance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (NEW.name,NEW.role,NEW.suspended) IS DISTINCT FROM (OLD.name,OLD.role,OLD.suspended) THEN NEW.governance_version:=OLD.governance_version+1;
 ELSIF NEW.governance_version<>OLD.governance_version THEN RAISE EXCEPTION 'Account governance version is server controlled'; END IF;
 IF OLD.role='SUPER_ADMIN' AND NOT OLD.suspended AND (NEW.role<>'SUPER_ADMIN' OR NEW.suspended) THEN
  PERFORM pg_advisory_xact_lock(481038);
  IF NOT EXISTS(SELECT 1 FROM app_actor WHERE id<>OLD.id AND role='SUPER_ADMIN' AND NOT suspended AND NOT is_test_fixture) THEN RAISE EXCEPTION 'Retain an active platform administrator' USING ERRCODE='23514'; END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER actor_governance_version BEFORE UPDATE ON app_actor FOR EACH ROW EXECUTE FUNCTION advance_actor_governance();
CREATE TABLE privacy_case (
 id uuid PRIMARY KEY,actor_id text NOT NULL REFERENCES app_actor(id),kind text NOT NULL CHECK(kind IN('ACCESS','CORRECTION','REMOVAL','DEACTIVATION','REACTIVATION')),
 message text NOT NULL CHECK(length(trim(message)) BETWEEN 5 AND 3000),requested_name text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((kind='CORRECTION' AND requested_name IS NOT NULL AND length(trim(requested_name)) BETWEEN 2 AND 120) OR (kind<>'CORRECTION' AND requested_name IS NULL))
);
CREATE INDEX privacy_case_requester ON privacy_case(actor_id,created_at DESC,id DESC);
CREATE TABLE privacy_case_state (
 case_id uuid PRIMARY KEY REFERENCES privacy_case(id),version integer NOT NULL DEFAULT 1 CHECK(version>0),
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN('OPEN','WAITING_USER','RESOLVED','REJECTED','WITHDRAWN')),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX privacy_review_queue ON privacy_case_state(status,updated_at,case_id);
CREATE TABLE privacy_case_event (
 id uuid PRIMARY KEY,case_id uuid NOT NULL REFERENCES privacy_case(id),version integer NOT NULL CHECK(version>=2),
 actor_id text NOT NULL REFERENCES app_actor(id),action text NOT NULL CHECK(action IN('REQUEST_INFO','REPLY','APPROVE','REJECT','WITHDRAW')),
 message text NOT NULL CHECK(length(trim(message)) BETWEEN 5 AND 3000),body jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(body)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(case_id,version)
);
CREATE TABLE privacy_case_command (
 id uuid PRIMARY KEY,case_id uuid NOT NULL REFERENCES privacy_case(id),actor_id text NOT NULL REFERENCES app_actor(id),
 request_key uuid NOT NULL,digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(actor_id,request_key)
);
CREATE TABLE account_governance_event (
 id uuid PRIMARY KEY,subject_id text NOT NULL REFERENCES app_actor(id),actor_id text NOT NULL REFERENCES app_actor(id),case_id uuid REFERENCES privacy_case(id),
 action text NOT NULL CHECK(action IN('CORRECT_NAME','DEACTIVATE','REACTIVATE','SUSPEND','CHANGE_ROLE')),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 5 AND 3000),before_version integer NOT NULL,after_version integer NOT NULL CHECK(after_version=before_version+1),
 body jsonb NOT NULL CHECK(jsonb_typeof(body)='object'),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX account_governance_history ON account_governance_event(subject_id,created_at DESC,id DESC);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['privacy_case','privacy_case_event','privacy_case_command','account_governance_event'] LOOP
 EXECUTE format('CREATE TRIGGER immutable_%I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION app_immutable()',t,t);
END LOOP;END $$;
CREATE FUNCTION guard_privacy_state() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR NEW.case_id<>OLD.case_id OR NEW.version<>OLD.version+1 OR OLD.status IN('RESOLVED','REJECTED','WITHDRAWN') THEN RAISE EXCEPTION 'Privacy history is closed or changed'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER privacy_state_progression BEFORE UPDATE OR DELETE ON privacy_case_state FOR EACH ROW EXECUTE FUNCTION guard_privacy_state();
CREATE FUNCTION verify_privacy_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c privacy_case%ROWTYPE; s privacy_case_state%ROWTYPE; reviewer boolean; prior text;
BEGIN
 SELECT * INTO STRICT c FROM privacy_case WHERE id=NEW.case_id;
 SELECT * INTO STRICT s FROM privacy_case_state WHERE case_id=c.id;
 SELECT role='SUPER_ADMIN' AND NOT suspended AND NOT is_test_fixture AND id<>c.actor_id INTO reviewer FROM app_actor WHERE id=NEW.actor_id;
 IF NEW.version<>s.version OR (NEW.action IN('APPROVE','REJECT','REQUEST_INFO') AND NOT COALESCE(reviewer,false)) OR (NEW.action IN('REPLY','WITHDRAW') AND NEW.actor_id<>c.actor_id) THEN RAISE EXCEPTION 'Exact privacy participant and version required' USING ERRCODE='23514'; END IF;
 prior:=CASE NEW.action WHEN 'REQUEST_INFO' THEN 'WAITING_USER' WHEN 'REPLY' THEN 'OPEN' WHEN 'APPROVE' THEN 'RESOLVED' WHEN 'REJECT' THEN 'REJECTED' ELSE 'WITHDRAWN' END;
 IF s.status<>prior THEN RAISE EXCEPTION 'Privacy event must match saved state' USING ERRCODE='23514'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER exact_privacy_event BEFORE INSERT ON privacy_case_event FOR EACH ROW EXECUTE FUNCTION verify_privacy_event();
CREATE FUNCTION conserve_privacy_history() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE key uuid; latest integer; BEGIN
 key:=NEW.case_id;SELECT COALESCE(max(version),1) INTO latest FROM privacy_case_event WHERE case_id=key;
 IF latest<>(SELECT version FROM privacy_case_state WHERE case_id=key) THEN RAISE EXCEPTION 'Privacy state must retain its exact event history'; END IF;RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER privacy_state_history AFTER INSERT OR UPDATE ON privacy_case_state DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION conserve_privacy_history();
CREATE CONSTRAINT TRIGGER privacy_event_history AFTER INSERT ON privacy_case_event DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION conserve_privacy_history();
-- A checkout that began before suspension must recheck while holding the actor
-- row, rather than relying on an earlier session/permission read.
CREATE FUNCTION require_available_booking_actor() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE u app_actor%ROWTYPE; BEGIN
 SELECT * INTO STRICT u FROM app_actor WHERE id=NEW.renter_id FOR SHARE;
 IF u.suspended OR u.is_test_fixture THEN RAISE EXCEPTION 'Current renter access is required' USING ERRCODE='23514'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER booking_renter_access BEFORE INSERT ON booking_request FOR EACH ROW EXECUTE FUNCTION require_available_booking_actor();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN
 GRANT SELECT,INSERT ON privacy_case,privacy_case_event,privacy_case_command,account_governance_event TO rent2go_app;
 GRANT SELECT,INSERT,UPDATE ON privacy_case_state TO rent2go_app;
END IF;END $$;
