CREATE TABLE app_request_budget (
  budget_key text PRIMARY KEY,
  hits integer NOT NULL CHECK(hits>0),
  window_start timestamptz NOT NULL
);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN
    GRANT SELECT,INSERT,UPDATE ON app_request_budget TO rent2go_app;
  END IF;
END $$;
