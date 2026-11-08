CREATE TABLE paymongo_notification (
 id uuid PRIMARY KEY,mode text NOT NULL CHECK(mode IN('test','live')),
 merchant_fingerprint text NOT NULL CHECK(merchant_fingerprint ~ '^[a-f0-9]{64}$'),
 provider_event_id text NOT NULL CHECK(provider_event_id ~ '^evt_[A-Za-z0-9]+$'),
 event_type text NOT NULL CHECK(length(event_type) BETWEEN 1 AND 100),
 kind text NOT NULL CHECK(kind IN('PAYMENT','IGNORED','INVALID_PAID')),
 raw_digest text NOT NULL CHECK(raw_digest ~ '^[a-f0-9]{64}$'),content_digest text NOT NULL CHECK(content_digest ~ '^[a-f0-9]{64}$'),
 provider_id text CHECK(provider_id ~ '^cs_[A-Za-z0-9]+$'),checkout_id uuid REFERENCES paymongo_checkout(id),
 projection jsonb,received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((kind='PAYMENT')=(projection IS NOT NULL)),CHECK(projection IS NULL OR jsonb_typeof(projection)='object'),
 FOREIGN KEY(checkout_id,mode,merchant_fingerprint) REFERENCES paymongo_checkout(id,mode,merchant_fingerprint),
 UNIQUE(mode,merchant_fingerprint,provider_event_id)
);
CREATE INDEX paymongo_notification_checkout ON paymongo_notification(checkout_id,received_at);
CREATE INDEX paymongo_notification_provider ON paymongo_notification(mode,merchant_fingerprint,provider_id);
CREATE TABLE paymongo_notification_state (
 notification_id uuid PRIMARY KEY REFERENCES paymongo_notification(id),next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX paymongo_notification_due ON paymongo_notification_state(next_attempt_at,notification_id);
CREATE TABLE paymongo_notification_conflict (
 id uuid PRIMARY KEY,notification_id uuid NOT NULL REFERENCES paymongo_notification(id),
 content_digest text NOT NULL CHECK(content_digest ~ '^[a-f0-9]{64}$'),raw_digest text NOT NULL CHECK(raw_digest ~ '^[a-f0-9]{64}$'),
 provider_id text CHECK(provider_id ~ '^cs_[A-Za-z0-9]+$'),checkout_id uuid REFERENCES paymongo_checkout(id),projection jsonb,
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(notification_id,content_digest)
);
CREATE TABLE paymongo_notification_result (
 notification_id uuid PRIMARY KEY REFERENCES paymongo_notification(id),checkout_id uuid REFERENCES paymongo_checkout(id),
 outcome text NOT NULL CHECK(outcome IN('RECORDED','IGNORED','UNMATCHED','INVALID_PAYLOAD','MISMATCH','CONFLICT')),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['paymongo_notification','paymongo_notification_conflict','paymongo_notification_result'] LOOP
  EXECUTE format('CREATE TRIGGER immutable_%I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION app_immutable()',t,t);
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN
  GRANT SELECT,INSERT ON paymongo_notification,paymongo_notification_state,paymongo_notification_conflict,paymongo_notification_result TO rent2go_app;
  GRANT UPDATE(next_attempt_at) ON paymongo_notification_state TO rent2go_app;
 END IF;
END $$;
