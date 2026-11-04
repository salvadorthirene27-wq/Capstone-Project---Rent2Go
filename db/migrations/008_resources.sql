-- Neon PG17 supports btree_gist1.7: https://neon.com/docs/extensions/pg-extensions
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE agency_driver (
 id uuid PRIMARY KEY,
 agency_id uuid NOT NULL REFERENCES agency(id),
 name text NOT NULL,
 phone text NOT NULL,
 license_number text NOT NULL,
 license_expiry date NOT NULL,
 active boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(agency_id,license_number)
);
CREATE TABLE resource (
 id uuid PRIMARY KEY,
 agency_id uuid NOT NULL REFERENCES agency(id),
 kind text NOT NULL CHECK(kind IN ('VEHICLE','DRIVER')),
 vehicle_id uuid UNIQUE REFERENCES physical_vehicle(id),
 driver_id uuid UNIQUE REFERENCES agency_driver(id),
 active boolean NOT NULL DEFAULT true,
 CHECK((kind='VEHICLE' AND vehicle_id=id AND driver_id IS NULL) OR (kind='DRIVER' AND driver_id=id AND vehicle_id IS NULL))
);
INSERT INTO resource(id,agency_id,kind,vehicle_id) SELECT v.id,o.agency_id,'VEHICLE',v.id FROM physical_vehicle v JOIN vehicle_offer o ON o.vehicle_id=v.id;
CREATE FUNCTION resource_for_new_vehicle_offer() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO resource(id,agency_id,kind,vehicle_id) VALUES(NEW.vehicle_id,NEW.agency_id,'VEHICLE',NEW.vehicle_id);
 RETURN NEW;
END $$;
CREATE TRIGGER new_vehicle_resource AFTER INSERT ON vehicle_offer FOR EACH ROW EXECUTE FUNCTION resource_for_new_vehicle_offer();
CREATE TABLE resource_occupation (
 id uuid PRIMARY KEY,
 resource_id uuid NOT NULL REFERENCES resource(id),
 kind text NOT NULL CHECK(kind IN ('UNAVAILABLE','MAINTENANCE','BOOKING')),
 start_at timestamptz NOT NULL,
 end_at timestamptz NOT NULL,
 period tstzrange GENERATED ALWAYS AS(tstzrange(start_at,end_at,'[)')) STORED,
 note text NOT NULL,
 created_by text NOT NULL REFERENCES app_actor(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 cancelled_at timestamptz,
 cancellation_reason text,
 CHECK(isfinite(start_at) AND isfinite(end_at) AND end_at>start_at),
 CHECK((cancelled_at IS NULL AND cancellation_reason IS NULL) OR (cancelled_at IS NOT NULL AND length(trim(cancellation_reason))>=10)),
 CONSTRAINT no_overlapping_resource_claim EXCLUDE USING gist(resource_id WITH =,period WITH &&) WHERE(cancelled_at IS NULL)
);
CREATE INDEX resource_occupation_history ON resource_occupation(resource_id,created_at DESC);
CREATE FUNCTION preserve_resource_claim() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Resource claim history cannot be deleted'; END IF;
 IF ROW(NEW.id,NEW.resource_id,NEW.kind,NEW.start_at,NEW.end_at,NEW.note,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.resource_id,OLD.kind,OLD.start_at,OLD.end_at,OLD.note,OLD.created_by,OLD.created_at) OR OLD.cancelled_at IS NOT NULL OR NEW.cancelled_at IS NULL THEN RAISE EXCEPTION 'Only one explicit cancellation may change a resource claim'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER preserve_resource_claim BEFORE UPDATE OR DELETE ON resource_occupation FOR EACH ROW EXECUTE FUNCTION preserve_resource_claim();
CREATE TABLE vehicle_maintenance (
 occupation_id uuid PRIMARY KEY REFERENCES resource_occupation(id),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 cost_centavos integer CHECK(cost_centavos BETWEEN 0 AND 100000000),
 completed_at timestamptz,
 completion_note text,
 CHECK((completed_at IS NULL AND cost_centavos IS NULL AND completion_note IS NULL) OR (completed_at IS NOT NULL AND cost_centavos IS NOT NULL AND length(trim(completion_note))>=10))
);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN
 GRANT SELECT,INSERT,UPDATE ON agency_driver,resource,resource_occupation,vehicle_maintenance TO rent2go_app;
END IF; END $$;
