CREATE TABLE tour_package (
 id uuid PRIMARY KEY, agency_id uuid NOT NULL REFERENCES agency(id),
 state text NOT NULL DEFAULT 'DRAFT' CHECK(state IN ('DRAFT','PUBLISHED','WITHDRAWN')),
 payload jsonb NOT NULL, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0), published_revision integer,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tour_revision (
 tour_id uuid NOT NULL REFERENCES tour_package(id),revision integer NOT NULL CHECK(revision>0),
 mode text NOT NULL CHECK(mode IN ('GROUP','PRIVATE')),payload jsonb NOT NULL,
 agency_policy_revision integer NOT NULL,platform_bps integer NOT NULL CHECK(platform_bps BETWEEN 0 AND 10000),
 agency_bps integer NOT NULL CHECK(agency_bps BETWEEN 0 AND 10000),
 digest text NOT NULL,created_by text NOT NULL REFERENCES app_actor(id),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tour_id,revision),UNIQUE(tour_id,revision,mode),
 CHECK(platform_bps+agency_bps=10000),CHECK(payload->>'mode'=mode)
);
ALTER TABLE tour_package ADD FOREIGN KEY(id,published_revision) REFERENCES tour_revision(tour_id,revision);
CREATE TABLE tour_file (
 id uuid PRIMARY KEY,tour_id uuid NOT NULL REFERENCES tour_package(id),uploader_id text NOT NULL REFERENCES app_actor(id),
 object_key text NOT NULL UNIQUE,original_name text NOT NULL,mime text NOT NULL CHECK(mime IN ('image/png','image/jpeg')),
 size_bytes integer NOT NULL CHECK(size_bytes>0 AND size_bytes<=8388608),sha256 text NOT NULL,
 backend text NOT NULL CHECK(backend IN ('local','s3')),is_current boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tour_revision_file (
 tour_id uuid NOT NULL,revision integer NOT NULL,file_id uuid NOT NULL REFERENCES tour_file(id),
 PRIMARY KEY(tour_id,revision,file_id),FOREIGN KEY(tour_id,revision) REFERENCES tour_revision(tour_id,revision)
);
CREATE TABLE tour_schedule (
 id uuid PRIMARY KEY,tour_id uuid NOT NULL,revision integer NOT NULL,mode text NOT NULL,
 start_at timestamptz NOT NULL,end_at timestamptz NOT NULL,cutoff_at timestamptz NOT NULL,
 period tstzrange GENERATED ALWAYS AS(tstzrange(start_at,end_at,'[)')) STORED,
 capacity integer NOT NULL CHECK(capacity BETWEEN 1 AND 5000),reserved_units integer NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED','CANCELLED')),
 cancellation_reason text,cancelled_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tour_id,revision,mode) REFERENCES tour_revision(tour_id,revision,mode),
 CHECK(isfinite(start_at) AND isfinite(end_at) AND isfinite(cutoff_at) AND end_at>start_at AND cutoff_at<start_at),
 CHECK(reserved_units>=0 AND reserved_units<=CASE WHEN mode='PRIVATE' THEN 1 ELSE capacity END),
 CHECK((status='SCHEDULED' AND cancelled_at IS NULL AND cancellation_reason IS NULL) OR
 (status='CANCELLED' AND reserved_units=0 AND cancelled_at IS NOT NULL AND length(trim(cancellation_reason))>=10)),
 CONSTRAINT private_tour_slot_overlap EXCLUDE USING gist(tour_id WITH =,period WITH &&) WHERE(mode='PRIVATE' AND status='SCHEDULED')
);
CREATE INDEX tour_schedule_upcoming ON tour_schedule(tour_id,start_at);
CREATE FUNCTION preserve_tour_schedule() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Tour schedule history cannot be deleted'; END IF;
 IF ROW(NEW.id,NEW.tour_id,NEW.revision,NEW.mode,NEW.start_at,NEW.end_at,NEW.cutoff_at,NEW.capacity,NEW.created_at) IS DISTINCT FROM
 ROW(OLD.id,OLD.tour_id,OLD.revision,OLD.mode,OLD.start_at,OLD.end_at,OLD.cutoff_at,OLD.capacity,OLD.created_at) OR OLD.status='CANCELLED'
 THEN RAISE EXCEPTION 'Preserve scheduled facts; cancel and create a new schedule'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER preserve_tour_schedule BEFORE UPDATE OR DELETE ON tour_schedule FOR EACH ROW EXECUTE FUNCTION preserve_tour_schedule();
CREATE TRIGGER immutable_tour_revision BEFORE UPDATE OR DELETE ON tour_revision FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_tour_revision_file BEFORE UPDATE OR DELETE ON tour_revision_file FOR EACH ROW EXECUTE FUNCTION app_immutable();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN
 GRANT SELECT,INSERT,UPDATE ON tour_package,tour_file,tour_schedule TO rent2go_app;
 GRANT SELECT,INSERT ON tour_revision,tour_revision_file TO rent2go_app;
END IF; END $$;
