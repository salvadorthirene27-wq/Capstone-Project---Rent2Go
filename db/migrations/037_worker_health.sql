CREATE TABLE background_worker (
 name text PRIMARY KEY CHECK(name='BOOKING_HOLD_EXPIRY'),
 instance_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN('RUNNING','STOPPED')),
 lease_until timestamptz NOT NULL,
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 last_success_at timestamptz,
 last_failure_at timestamptz,
 last_error_type text CHECK(last_error_type IS NULL OR last_error_type ~ '^[A-Za-z][A-Za-z0-9]{0,59}$'),
 last_processed integer DEFAULT 0 CHECK(last_processed BETWEEN 0 AND 100)
);
CREATE TABLE background_worker_run (
 id uuid PRIMARY KEY,
 worker_name text NOT NULL REFERENCES background_worker(name),
 instance_id uuid NOT NULL,
 outcome text NOT NULL CHECK(outcome IN('SUCCEEDED','FAILED')),
 processed integer CHECK(processed BETWEEN 0 AND 100),
 error_type text CHECK(error_type IS NULL OR error_type ~ '^[A-Za-z][A-Za-z0-9]{0,59}$'),
 started_at timestamptz NOT NULL,
 completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((outcome='SUCCEEDED' AND processed IS NOT NULL AND error_type IS NULL) OR (outcome='FAILED' AND processed IS NULL AND error_type IS NOT NULL))
);
CREATE INDEX background_worker_history ON background_worker_run(worker_name,completed_at DESC,id DESC);
CREATE TRIGGER immutable_background_worker_run BEFORE UPDATE OR DELETE ON background_worker_run FOR EACH ROW EXECUTE FUNCTION app_immutable();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN
 GRANT SELECT,INSERT,UPDATE ON background_worker TO rent2go_app;
 GRANT SELECT,INSERT ON background_worker_run TO rent2go_app;
END IF; END $$;
