CREATE TABLE account_governance_command (
 id uuid PRIMARY KEY,actor_id text NOT NULL REFERENCES app_actor(id),subject_id text NOT NULL REFERENCES app_actor(id),
 request_key uuid NOT NULL,digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),event_id uuid NOT NULL UNIQUE REFERENCES account_governance_event(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(actor_id,request_key)
);
CREATE TRIGGER immutable_account_governance_command BEFORE UPDATE OR DELETE ON account_governance_command FOR EACH ROW EXECUTE FUNCTION app_immutable();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN GRANT SELECT,INSERT ON account_governance_command TO rent2go_app; END IF;END $$;
