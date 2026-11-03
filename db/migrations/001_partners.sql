CREATE TABLE app_actor (
  id text PRIMARY KEY,
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'RENTER' CHECK (role IN ('RENTER','COSIGNER','AGENCY_ADMIN','SUPER_ADMIN')),
  suspended boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE partner_application (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL UNIQUE REFERENCES app_actor(id),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','CHANGES_REQUESTED','APPROVED','REJECTED','WITHDRAWN')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  submitted_revision integer NOT NULL DEFAULT 0 CHECK (submitted_revision >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE partner_revision (
  application_id uuid NOT NULL REFERENCES partner_application(id),
  revision integer NOT NULL,
  payload jsonb NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(application_id, revision)
);
CREATE TABLE partner_review (
  id uuid PRIMARY KEY,
  application_id uuid NOT NULL,
  revision integer NOT NULL,
  reviewer_id text NOT NULL REFERENCES app_actor(id),
  decision text NOT NULL CHECK (decision IN ('APPROVE','CHANGES_REQUESTED','REJECT')),
  reason text NOT NULL CHECK (length(trim(reason)) >= 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(application_id, revision) REFERENCES partner_revision(application_id, revision),
  UNIQUE(application_id, revision)
);
CREATE TABLE agency (
  id uuid PRIMARY KEY,
  application_id uuid NOT NULL UNIQUE REFERENCES partner_application(id),
  owner_id text NOT NULL UNIQUE REFERENCES app_actor(id),
  approved_revision integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(application_id, approved_revision) REFERENCES partner_revision(application_id, revision)
);
CREATE TABLE private_file (
  id uuid PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES partner_application(id),
  owner_id text NOT NULL REFERENCES app_actor(id),
  purpose text NOT NULL CHECK (purpose IN ('REGISTRATION','PERMIT','GCASH_QR')),
  object_key text NOT NULL UNIQUE,
  original_name text NOT NULL,
  mime text NOT NULL CHECK (mime IN ('application/pdf','image/jpeg','image/png')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 8388608),
  sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE partner_revision_file (
  application_id uuid NOT NULL,
  revision integer NOT NULL,
  file_id uuid NOT NULL REFERENCES private_file(id),
  PRIMARY KEY(application_id,revision,file_id),
  FOREIGN KEY(application_id,revision) REFERENCES partner_revision(application_id,revision)
);
CREATE TABLE app_audit (
  id uuid PRIMARY KEY,
  actor_id text NOT NULL REFERENCES app_actor(id),
  action text NOT NULL,
  entity_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app_notification (
  id uuid PRIMARY KEY,
  recipient_id text NOT NULL REFERENCES app_actor(id),
  application_id uuid NOT NULL REFERENCES partner_application(id),
  message text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX application_queue ON partner_application(status,updated_at DESC);
CREATE INDEX notification_owner ON app_notification(recipient_id,created_at DESC);
CREATE FUNCTION app_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Historical records are immutable'; END $$;
CREATE TRIGGER immutable_revision BEFORE UPDATE OR DELETE ON partner_revision FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_revision_file BEFORE UPDATE OR DELETE ON partner_revision_file FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_review BEFORE UPDATE OR DELETE ON partner_review FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON app_audit FOR EACH ROW EXECUTE FUNCTION app_immutable();
