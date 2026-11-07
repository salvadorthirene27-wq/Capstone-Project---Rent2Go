CREATE TABLE email_preference (
 actor_id text PRIMARY KEY REFERENCES app_actor(id),email text NOT NULL CHECK(length(email) BETWEEN 3 AND 254 AND email !~ E'[\r\n<>]'),enabled boolean NOT NULL,
 version integer NOT NULL CHECK(version>0),updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE email_message (
 id uuid PRIMARY KEY,source text NOT NULL CHECK(source IN('PARTNER','BOOKING','FINANCE','VEHICLE')),notification_id uuid NOT NULL,
 recipient_id text NOT NULL REFERENCES app_actor(id),email text NOT NULL,preference_version integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(source,notification_id)
);
CREATE INDEX email_recipient_history ON email_message(recipient_id,created_at DESC,id DESC);
CREATE TABLE email_attempt (
 id uuid PRIMARY KEY,message_id uuid NOT NULL REFERENCES email_message(id),ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 3),
 request_key uuid NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),dispatch_at timestamptz,
 UNIQUE(message_id,ordinal)
);
CREATE TABLE email_result (
 attempt_id uuid PRIMARY KEY REFERENCES email_attempt(id),outcome text NOT NULL CHECK(outcome IN('ACCEPTED','REJECTED','UNKNOWN','CANCELLED')),
 reason text NOT NULL CHECK(reason IN('SMTP_ACCEPTED','RECIPIENT_REJECTED','AUTHENTICATION_FAILED','SMTP_REJECTED','OUTCOME_UNCONFIRMED','PERMISSION_CHANGED','EXPIRED','INTERRUPTED')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((outcome='ACCEPTED' AND reason='SMTP_ACCEPTED') OR (outcome='REJECTED' AND reason IN('RECIPIENT_REJECTED','AUTHENTICATION_FAILED','SMTP_REJECTED')) OR (outcome='UNKNOWN' AND reason IN('OUTCOME_UNCONFIRMED','INTERRUPTED')) OR (outcome='CANCELLED' AND reason IN('PERMISSION_CHANGED','EXPIRED')))
);
CREATE TRIGGER immutable_email_message BEFORE UPDATE OR DELETE ON email_message FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_email_result BEFORE UPDATE OR DELETE ON email_result FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE FUNCTION email_preference_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR NEW.actor_id<>OLD.actor_id OR NEW.version<>OLD.version+1 OR NEW.updated_at<OLD.updated_at THEN RAISE EXCEPTION 'Email preferences require an advancing version'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER protect_email_preference BEFORE UPDATE OR DELETE ON email_preference FOR EACH ROW EXECUTE FUNCTION email_preference_guard();
CREATE FUNCTION email_source_recipient(kind text,notification uuid) RETURNS text LANGUAGE plpgsql STABLE AS $$ DECLARE recipient text; BEGIN
 CASE kind WHEN 'PARTNER' THEN SELECT recipient_id INTO recipient FROM app_notification WHERE id=notification;
 WHEN 'BOOKING' THEN SELECT recipient_id INTO recipient FROM booking_notification WHERE id=notification;
 WHEN 'FINANCE' THEN SELECT recipient_id INTO recipient FROM finance_notification WHERE id=notification;
 WHEN 'VEHICLE' THEN SELECT recipient_id INTO recipient FROM vehicle_notification WHERE id=notification;ELSE RETURN NULL; END CASE;RETURN recipient;
END $$;
CREATE FUNCTION email_message_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.recipient_id IS DISTINCT FROM email_source_recipient(NEW.source,NEW.notification_id) OR NOT EXISTS(SELECT 1 FROM email_preference p JOIN app_actor a ON a.id=p.actor_id WHERE p.actor_id=NEW.recipient_id AND p.enabled AND p.email=NEW.email AND lower(a.email)=lower(p.email) AND p.version=NEW.preference_version AND NOT a.suspended AND NOT a.is_test_fixture) THEN RAISE EXCEPTION 'Email source and current permission must match'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER validate_email_message BEFORE INSERT ON email_message FOR EACH ROW EXECUTE FUNCTION email_message_guard();
CREATE FUNCTION email_attempt_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE previous email_attempt; BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Email attempts are immutable'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-'dispatch_at')<>(to_jsonb(OLD)-'dispatch_at') OR OLD.dispatch_at IS NOT NULL OR NEW.dispatch_at IS NULL OR EXISTS(SELECT 1 FROM email_result WHERE attempt_id=OLD.id) THEN RAISE EXCEPTION 'Email attempt may dispatch only once'; END IF;RETURN NEW;
 END IF;
 PERFORM id FROM email_message WHERE id=NEW.message_id FOR UPDATE;
 SELECT * INTO previous FROM email_attempt WHERE message_id=NEW.message_id ORDER BY ordinal DESC LIMIT 1;
 IF NEW.dispatch_at IS NOT NULL OR NEW.ordinal<>COALESCE(previous.ordinal,0)+1 OR (previous.id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM email_result WHERE attempt_id=previous.id AND outcome='REJECTED')) THEN RAISE EXCEPTION 'Only a rejected email may be explicitly retried'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER protect_email_attempt BEFORE INSERT OR UPDATE OR DELETE ON email_attempt FOR EACH ROW EXECUTE FUNCTION email_attempt_guard();
CREATE FUNCTION email_result_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE dispatched timestamptz; BEGIN
 SELECT dispatch_at INTO dispatched FROM email_attempt WHERE id=NEW.attempt_id FOR UPDATE;
 IF NEW.outcome<>'CANCELLED' AND dispatched IS NULL THEN RAISE EXCEPTION 'Only a dispatched email has a provider outcome'; END IF;
 IF NEW.reason='INTERRUPTED' AND dispatched>clock_timestamp()-interval '2 minutes' THEN RAISE EXCEPTION 'Wait for the email recovery deadline'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER validate_email_result BEFORE INSERT ON email_result FOR EACH ROW EXECUTE FUNCTION email_result_guard();
CREATE FUNCTION enqueue_email_update() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE message uuid:=gen_random_uuid();kind text; BEGIN
 kind:=CASE TG_TABLE_NAME WHEN 'app_notification' THEN 'PARTNER' WHEN 'booking_notification' THEN 'BOOKING' WHEN 'finance_notification' THEN 'FINANCE' ELSE 'VEHICLE' END;
 -- Future events only; no historical email delivery is invented or backfilled.
 INSERT INTO email_message(id,source,notification_id,recipient_id,email,preference_version)
 SELECT message,kind,NEW.id,p.actor_id,p.email,p.version FROM email_preference p JOIN app_actor a ON a.id=p.actor_id
 WHERE p.actor_id=NEW.recipient_id AND p.enabled AND NOT a.suspended AND NOT a.is_test_fixture AND lower(a.email)=lower(p.email) AND NEW.created_at>=p.updated_at;
 IF FOUND THEN INSERT INTO email_attempt(id,message_id,ordinal,request_key)VALUES(gen_random_uuid(),message,1,gen_random_uuid()); END IF;RETURN NEW;
END $$;
CREATE TRIGGER enqueue_partner_email AFTER INSERT ON app_notification FOR EACH ROW EXECUTE FUNCTION enqueue_email_update();
CREATE TRIGGER enqueue_booking_email AFTER INSERT ON booking_notification FOR EACH ROW EXECUTE FUNCTION enqueue_email_update();
CREATE TRIGGER enqueue_finance_email AFTER INSERT ON finance_notification FOR EACH ROW EXECUTE FUNCTION enqueue_email_update();
CREATE TRIGGER enqueue_vehicle_email AFTER INSERT ON vehicle_notification FOR EACH ROW EXECUTE FUNCTION enqueue_email_update();
