CREATE TABLE agency_member (
  agency_id uuid NOT NULL REFERENCES agency(id),
  actor_id text NOT NULL REFERENCES app_actor(id),
  role text NOT NULL CHECK(role IN ('OWNER','ADMIN')),
  active boolean NOT NULL DEFAULT true,
  created_by text REFERENCES app_actor(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(agency_id,actor_id)
);
INSERT INTO agency_member(agency_id,actor_id,role)
SELECT id,owner_id,'OWNER' FROM agency ON CONFLICT DO NOTHING;
CREATE INDEX agency_memberships_by_actor ON agency_member(actor_id) WHERE active;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN
    GRANT SELECT,INSERT,UPDATE ON agency_member TO rent2go_app;
  END IF;
END $$;
