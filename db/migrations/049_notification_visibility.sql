-- Deletion only hides a delivered update in its recipient's inbox.
-- Source records and immutable read receipts remain part of their original history.
CREATE TABLE notification_action (
 id uuid PRIMARY KEY, recipient_id text NOT NULL REFERENCES app_actor(id),
 idempotency_key uuid NOT NULL, digest text NOT NULL CHECK(length(digest)=64),
 action text NOT NULL CHECK(action IN ('MARK_ALL_READ','DELETE_ONE','DELETE_READ','RESTORE_ONE','RESTORE_BATCH')),
 targets jsonb NOT NULL CHECK(jsonb_typeof(targets)='array'),
 affected integer NOT NULL CHECK(affected>=0), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(recipient_id,idempotency_key), UNIQUE(id,recipient_id)
);
CREATE TRIGGER immutable_notification_action BEFORE UPDATE OR DELETE ON notification_action FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TABLE notification_visibility (
 source text NOT NULL CHECK(source IN ('PARTNER','BOOKING','FINANCE','VEHICLE','REMITTANCE','GOVERNANCE')),
 notification_id uuid NOT NULL, recipient_id text NOT NULL REFERENCES app_actor(id),
 hidden_at timestamptz, batch_id uuid,
 PRIMARY KEY(source,notification_id),
 CHECK((hidden_at IS NULL)=(batch_id IS NULL)),
 FOREIGN KEY(batch_id,recipient_id) REFERENCES notification_action(id,recipient_id)
);
CREATE INDEX notification_visibility_recipient ON notification_visibility(recipient_id,hidden_at);
CREATE TRIGGER validate_notification_visibility_recipient BEFORE INSERT ON notification_visibility FOR EACH ROW EXECUTE FUNCTION notification_receipt_identity();
CREATE FUNCTION protect_notification_visibility() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Restore notification visibility instead of deleting its history'; END IF;
 IF TG_OP='UPDATE' AND (NEW.source,NEW.notification_id,NEW.recipient_id) IS DISTINCT FROM (OLD.source,OLD.notification_id,OLD.recipient_id) THEN
  RAISE EXCEPTION 'Notification visibility identity is immutable';
 END IF;
 IF NEW.batch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM notification_action a WHERE a.id=NEW.batch_id AND a.recipient_id=NEW.recipient_id AND a.action IN ('DELETE_ONE','DELETE_READ') AND a.targets @> jsonb_build_array(jsonb_build_object('source',NEW.source,'id',NEW.notification_id))) THEN
  RAISE EXCEPTION 'Notification deletion must belong to its recorded recipient action';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_notification_visibility BEFORE INSERT OR UPDATE OR DELETE ON notification_visibility FOR EACH ROW EXECUTE FUNCTION protect_notification_visibility();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN
 GRANT SELECT,INSERT ON notification_action,notification_visibility TO rent2go_app;
 GRANT UPDATE(hidden_at,batch_id) ON notification_visibility TO rent2go_app;
END IF; END $$;
