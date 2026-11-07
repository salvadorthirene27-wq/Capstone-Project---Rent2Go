CREATE TABLE governance_notification (
 id uuid PRIMARY KEY,recipient_id text NOT NULL REFERENCES app_actor(id),case_id uuid REFERENCES privacy_case(id),account_event_id uuid REFERENCES account_governance_event(id),
 message text NOT NULL CHECK(length(message) BETWEEN 1 AND 1000),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((case_id IS NOT NULL AND account_event_id IS NULL) OR (case_id IS NULL AND account_event_id IS NOT NULL))
);
CREATE INDEX governance_notification_recipient ON governance_notification(recipient_id,created_at DESC,id DESC);
CREATE TRIGGER immutable_governance_notification BEFORE UPDATE OR DELETE ON governance_notification FOR EACH ROW EXECUTE FUNCTION app_immutable();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN GRANT SELECT,INSERT ON governance_notification TO rent2go_app; END IF;END $$;

ALTER TABLE notification_read_receipt DROP CONSTRAINT notification_read_receipt_source_check;
ALTER TABLE notification_read_receipt ADD CONSTRAINT notification_read_receipt_source_check CHECK(source IN('PARTNER','BOOKING','FINANCE','VEHICLE','REMITTANCE','GOVERNANCE'));
CREATE OR REPLACE FUNCTION notification_receipt_identity() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE recipient text; BEGIN
 CASE NEW.source WHEN 'PARTNER' THEN SELECT recipient_id INTO recipient FROM app_notification WHERE id=NEW.notification_id;
 WHEN 'BOOKING' THEN SELECT recipient_id INTO recipient FROM booking_notification WHERE id=NEW.notification_id;
 WHEN 'FINANCE' THEN SELECT recipient_id INTO recipient FROM finance_notification WHERE id=NEW.notification_id;
 WHEN 'VEHICLE' THEN SELECT recipient_id INTO recipient FROM vehicle_notification WHERE id=NEW.notification_id;
 WHEN 'REMITTANCE' THEN SELECT recipient_id INTO recipient FROM remittance_notification WHERE id=NEW.notification_id;
 WHEN 'GOVERNANCE' THEN SELECT recipient_id INTO recipient FROM governance_notification WHERE id=NEW.notification_id;
 ELSE RAISE EXCEPTION 'Unknown notification source'; END CASE;
 IF recipient IS DISTINCT FROM NEW.recipient_id THEN RAISE EXCEPTION 'Read receipt must belong to the delivered recipient'; END IF;RETURN NEW;
END $$;
ALTER TABLE email_message DROP CONSTRAINT email_message_source_check;
ALTER TABLE email_message ADD CONSTRAINT email_message_source_check CHECK(source IN('PARTNER','BOOKING','FINANCE','VEHICLE','REMITTANCE','GOVERNANCE'));
CREATE OR REPLACE FUNCTION email_source_recipient(kind text,notification uuid) RETURNS text LANGUAGE plpgsql STABLE AS $$ DECLARE recipient text; BEGIN
 CASE kind WHEN 'PARTNER' THEN SELECT recipient_id INTO recipient FROM app_notification WHERE id=notification;
 WHEN 'BOOKING' THEN SELECT recipient_id INTO recipient FROM booking_notification WHERE id=notification;
 WHEN 'FINANCE' THEN SELECT recipient_id INTO recipient FROM finance_notification WHERE id=notification;
 WHEN 'VEHICLE' THEN SELECT recipient_id INTO recipient FROM vehicle_notification WHERE id=notification;
 WHEN 'REMITTANCE' THEN SELECT recipient_id INTO recipient FROM remittance_notification WHERE id=notification;
 WHEN 'GOVERNANCE' THEN SELECT recipient_id INTO recipient FROM governance_notification WHERE id=notification;
 ELSE RETURN NULL; END CASE;RETURN recipient;
END $$;
CREATE OR REPLACE FUNCTION enqueue_email_update() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE message uuid:=gen_random_uuid();kind text; BEGIN
 kind:=CASE TG_TABLE_NAME WHEN 'app_notification' THEN 'PARTNER' WHEN 'booking_notification' THEN 'BOOKING' WHEN 'finance_notification' THEN 'FINANCE' WHEN 'vehicle_notification' THEN 'VEHICLE' WHEN 'remittance_notification' THEN 'REMITTANCE' WHEN 'governance_notification' THEN 'GOVERNANCE' END;
 IF kind IS NULL THEN RAISE EXCEPTION 'Unknown email notification source'; END IF;
 INSERT INTO email_message(id,source,notification_id,recipient_id,email,preference_version)
 SELECT message,kind,NEW.id,p.actor_id,p.email,p.version FROM email_preference p JOIN app_actor a ON a.id=p.actor_id
 WHERE p.actor_id=NEW.recipient_id AND p.enabled AND NOT a.suspended AND NOT a.is_test_fixture AND lower(a.email)=lower(p.email) AND NEW.created_at>=p.updated_at;
 IF FOUND THEN INSERT INTO email_attempt(id,message_id,ordinal,request_key)VALUES(gen_random_uuid(),message,1,gen_random_uuid()); END IF;RETURN NEW;
END $$;
CREATE TRIGGER enqueue_governance_email AFTER INSERT ON governance_notification FOR EACH ROW EXECUTE FUNCTION enqueue_email_update();
