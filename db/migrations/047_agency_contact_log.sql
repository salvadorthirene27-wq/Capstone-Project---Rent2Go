-- Optional internal follow-up records; independent of gateway migrations.
CREATE TABLE booking_contact_state (
 request_id uuid PRIMARY KEY REFERENCES booking_request(id),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 assigned_actor_id text REFERENCES app_actor(id),
 next_follow_up_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX booking_contact_schedule ON booking_contact_state(next_follow_up_at,request_id) WHERE next_follow_up_at IS NOT NULL;
CREATE TABLE booking_contact_command (
 id uuid PRIMARY KEY,request_id uuid NOT NULL REFERENCES booking_request(id),actor_id text NOT NULL REFERENCES app_actor(id),
 idempotency_key uuid NOT NULL,digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(request_id,actor_id,idempotency_key)
);
CREATE TABLE booking_contact_event (
 id uuid PRIMARY KEY,request_id uuid NOT NULL REFERENCES booking_request(id),command_id uuid NOT NULL UNIQUE REFERENCES booking_contact_command(id),
 version integer NOT NULL CHECK(version>1),kind text NOT NULL CHECK(kind IN('ASSIGNMENT','CONTACT')),
 actor_id text NOT NULL REFERENCES app_actor(id),actor_name text NOT NULL,
 assigned_actor_id text REFERENCES app_actor(id),assigned_name text,
 method text CHECK(method IN('PHONE','EMAIL')),outcome text CHECK(outcome IN('REACHED','NO_ANSWER','AWAITING_REPLY','NOT_PROCEEDING')),
 contacted_at timestamptz,note text NOT NULL CHECK(length(trim(note)) BETWEEN 3 AND 2000),next_follow_up_at timestamptz,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(request_id,version),
 CHECK((assigned_actor_id IS NULL)=(assigned_name IS NULL)),
 CHECK((kind='ASSIGNMENT' AND method IS NULL AND outcome IS NULL AND contacted_at IS NULL) OR (kind='CONTACT' AND method IS NOT NULL AND outcome IS NOT NULL AND contacted_at IS NOT NULL)),
 CHECK(contacted_at IS NULL OR contacted_at<=recorded_at+interval '2 minutes')
);
CREATE INDEX booking_contact_history ON booking_contact_event(request_id,version DESC);
CREATE TRIGGER immutable_booking_contact_command BEFORE UPDATE OR DELETE ON booking_contact_command FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_booking_contact_event BEFORE UPDATE OR DELETE ON booking_contact_event FOR EACH ROW EXECUTE FUNCTION app_immutable();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN
 GRANT SELECT,INSERT,UPDATE ON booking_contact_state TO rent2go_app;
 GRANT SELECT,INSERT ON booking_contact_command,booking_contact_event TO rent2go_app;
END IF; END $$;
