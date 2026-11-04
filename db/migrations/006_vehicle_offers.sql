CREATE TABLE physical_vehicle (
 id uuid PRIMARY KEY,
 ownership text NOT NULL CHECK(ownership IN ('CONSIGNED','AGENCY_OWNED')),
 owner_actor_id text REFERENCES app_actor(id),
 owner_agency_id uuid REFERENCES agency(id),
 registration_normalized text NOT NULL UNIQUE CHECK(registration_normalized ~ '^[A-Z0-9]{3,12}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((ownership='CONSIGNED' AND owner_actor_id IS NOT NULL AND owner_agency_id IS NULL) OR (ownership='AGENCY_OWNED' AND owner_actor_id IS NULL AND owner_agency_id IS NOT NULL))
);
CREATE TABLE vehicle_offer (
 id uuid PRIMARY KEY,
 vehicle_id uuid NOT NULL UNIQUE REFERENCES physical_vehicle(id),
 agency_id uuid NOT NULL REFERENCES agency(id),
 state text NOT NULL DEFAULT 'DRAFT' CHECK(state IN ('DRAFT','SUBMITTED','AGREEMENT_PENDING','COMPLIANCE_REVIEW','APPROVED','PUBLISHED','CHANGES_REQUESTED','REJECTED')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 approved_revision integer,
 draft_facts jsonb NOT NULL CHECK(jsonb_typeof(draft_facts)='object'),
 draft_terms jsonb NOT NULL CHECK(jsonb_typeof(draft_terms)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(state NOT IN ('APPROVED','PUBLISHED') OR approved_revision IS NOT NULL)
);
CREATE TABLE vehicle_revision (
 offer_id uuid NOT NULL REFERENCES vehicle_offer(id),
 revision integer NOT NULL CHECK(revision>0),
 facts jsonb NOT NULL,
 terms jsonb NOT NULL,
 agency_policy_revision integer NOT NULL,
 digest text NOT NULL,
 created_by text NOT NULL REFERENCES app_actor(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(offer_id,revision)
);
ALTER TABLE vehicle_offer ADD CONSTRAINT approved_vehicle_revision FOREIGN KEY(id,approved_revision) REFERENCES vehicle_revision(offer_id,revision);
CREATE TABLE vehicle_agreement (
 offer_id uuid NOT NULL,
 revision integer NOT NULL,
 signer_id text NOT NULL REFERENCES app_actor(id),
 digest text NOT NULL,
 accepted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(offer_id,revision),
 FOREIGN KEY(offer_id,revision) REFERENCES vehicle_revision(offer_id,revision)
);
CREATE TABLE vehicle_event (
 id uuid PRIMARY KEY,
 offer_id uuid NOT NULL REFERENCES vehicle_offer(id),
 actor_id text NOT NULL REFERENCES app_actor(id),
 action text NOT NULL,
 previous_state text NOT NULL,
 next_state text NOT NULL,
 revision integer NOT NULL,
 reason text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE vehicle_file (
 id uuid PRIMARY KEY,
 vehicle_id uuid NOT NULL REFERENCES physical_vehicle(id),
 uploader_id text NOT NULL REFERENCES app_actor(id),
 purpose text NOT NULL CHECK(purpose IN ('OWNERSHIP','PHOTO')),
 object_key text NOT NULL UNIQUE,
 original_name text NOT NULL,
 mime text NOT NULL CHECK(mime IN ('application/pdf','image/png','image/jpeg')),
 size_bytes integer NOT NULL CHECK(size_bytes>0 AND size_bytes<=8388608),
 sha256 text NOT NULL,
 backend text NOT NULL CHECK(backend IN ('local','s3')),
 is_current boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(purpose<>'PHOTO' OR mime IN ('image/png','image/jpeg'))
);
CREATE UNIQUE INDEX one_current_vehicle_ownership ON vehicle_file(vehicle_id) WHERE is_current AND purpose='OWNERSHIP';
CREATE TABLE vehicle_revision_file (
 offer_id uuid NOT NULL,
 revision integer NOT NULL,
 file_id uuid NOT NULL REFERENCES vehicle_file(id),
 PRIMARY KEY(offer_id,revision,file_id),
 FOREIGN KEY(offer_id,revision) REFERENCES vehicle_revision(offer_id,revision)
);
CREATE INDEX vehicle_review_queue ON vehicle_offer(state,updated_at);
CREATE INDEX vehicle_owner ON physical_vehicle(owner_actor_id);
CREATE TRIGGER immutable_vehicle_revision BEFORE UPDATE OR DELETE ON vehicle_revision FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_vehicle_agreement BEFORE UPDATE OR DELETE ON vehicle_agreement FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_vehicle_event BEFORE UPDATE OR DELETE ON vehicle_event FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_vehicle_revision_file BEFORE UPDATE OR DELETE ON vehicle_revision_file FOR EACH ROW EXECUTE FUNCTION app_immutable();
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN
  GRANT SELECT,INSERT ON physical_vehicle TO rent2go_app;
  GRANT SELECT,INSERT,UPDATE ON vehicle_offer,vehicle_file TO rent2go_app;
  GRANT SELECT,INSERT ON vehicle_revision,vehicle_agreement,vehicle_event,vehicle_revision_file TO rent2go_app;
 END IF;
END $$;
