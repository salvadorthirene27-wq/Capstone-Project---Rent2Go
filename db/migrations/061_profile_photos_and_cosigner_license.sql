CREATE TABLE account_photo (
  actor_id text PRIMARY KEY REFERENCES app_actor(id),
  revision uuid NOT NULL,
  image bytea NOT NULL CHECK (octet_length(image) BETWEEN 1 AND 524288)
);

ALTER TABLE vehicle_file DROP CONSTRAINT vehicle_file_purpose_check;
ALTER TABLE vehicle_file ADD CONSTRAINT vehicle_file_purpose_check
  CHECK (purpose IN ('OWNERSHIP', 'DRIVER_LICENSE', 'PHOTO'));
CREATE UNIQUE INDEX one_current_vehicle_license
  ON vehicle_file(vehicle_id) WHERE is_current AND purpose='DRIVER_LICENSE';

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON account_photo TO rent2go_app;
  END IF;
END $$;
