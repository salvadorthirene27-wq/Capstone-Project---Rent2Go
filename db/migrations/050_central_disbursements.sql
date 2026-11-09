CREATE TABLE central_disbursement_account (
 request_id uuid PRIMARY KEY REFERENCES booking_request(id),version integer NOT NULL DEFAULT 1 CHECK(version>0)
);
CREATE TABLE central_disbursement (
 id uuid PRIMARY KEY,request_id uuid NOT NULL REFERENCES booking_request(id),agency_id uuid NOT NULL REFERENCES agency(id),
 close_id uuid NOT NULL,quote_id uuid NOT NULL,environment text NOT NULL CHECK(environment IN ('DEMO','MANUAL')),
 revision integer NOT NULL CHECK(revision>0),created_by text NOT NULL REFERENCES app_actor(id),
 destination jsonb NOT NULL CHECK(jsonb_typeof(destination)='object'),source_digest text NOT NULL CHECK(source_digest ~ '^[a-f0-9]{64}$'),
 body jsonb NOT NULL CHECK(jsonb_typeof(body)='object'),amount_centavos bigint NOT NULL CHECK(amount_centavos BETWEEN 1 AND 9007199254740991),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(request_id,revision),UNIQUE(id,request_id),
 FOREIGN KEY(close_id,request_id,quote_id,agency_id,environment) REFERENCES booking_financial_close(id,request_id,quote_id,agency_id,environment)
);
CREATE TABLE central_disbursement_event (
 id uuid PRIMARY KEY,disbursement_id uuid NOT NULL,request_id uuid NOT NULL,sequence integer NOT NULL CHECK(sequence>0),
 actor_id text NOT NULL REFERENCES app_actor(id),action text NOT NULL CHECK(action IN ('APPROVE','REJECT','WITHDRAW')),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(disbursement_id,request_id) REFERENCES central_disbursement(id,request_id),UNIQUE(disbursement_id,sequence),UNIQUE(disbursement_id,action)
);
CREATE TABLE central_disbursement_file (
 id uuid PRIMARY KEY,request_id uuid NOT NULL REFERENCES booking_request(id),uploaded_by text NOT NULL REFERENCES app_actor(id),
 mime text NOT NULL CHECK(mime IN ('image/png','image/jpeg','application/pdf')),size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),backend text NOT NULL CHECK(backend IN ('local','s3')),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(id,request_id)
);
CREATE TABLE central_disbursement_transfer (
 id uuid PRIMARY KEY,disbursement_id uuid NOT NULL UNIQUE,request_id uuid NOT NULL,actor_id text NOT NULL REFERENCES app_actor(id),
 simulated boolean NOT NULL,reference text NOT NULL CHECK(length(trim(reference)) BETWEEN 1 AND 160),
 reference_normalized text NOT NULL CHECK(length(reference_normalized) BETWEEN 1 AND 160),reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),
 file_id uuid,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(disbursement_id,request_id) REFERENCES central_disbursement(id,request_id),FOREIGN KEY(file_id,request_id) REFERENCES central_disbursement_file(id,request_id),
 CHECK(simulated=(file_id IS NULL)),UNIQUE(id,disbursement_id),UNIQUE(simulated,reference_normalized)
);
CREATE TABLE central_disbursement_confirmation (
 id uuid PRIMARY KEY,disbursement_id uuid NOT NULL UNIQUE,transfer_id uuid NOT NULL UNIQUE,actor_id text NOT NULL REFERENCES app_actor(id),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(transfer_id,disbursement_id) REFERENCES central_disbursement_transfer(id,disbursement_id),UNIQUE(id,disbursement_id)
);
CREATE TABLE central_disbursement_release (
 entry_id uuid PRIMARY KEY REFERENCES booking_revenue_entry(id),disbursement_id uuid NOT NULL,confirmation_id uuid NOT NULL,
 amount_centavos bigint NOT NULL CHECK(amount_centavos BETWEEN 0 AND 9007199254740991),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(confirmation_id,disbursement_id) REFERENCES central_disbursement_confirmation(id,disbursement_id)
);
CREATE TABLE central_disbursement_command (
 request_id uuid NOT NULL REFERENCES booking_request(id),actor_id text NOT NULL REFERENCES app_actor(id),idempotency_key uuid NOT NULL,
 digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),disbursement_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(request_id,actor_id,idempotency_key),FOREIGN KEY(disbursement_id,request_id) REFERENCES central_disbursement(id,request_id)
);
CREATE FUNCTION central_disbursement_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d central_disbursement; t central_disbursement_transfer; e booking_revenue_entry; original jsonb;
BEGIN
 IF TG_TABLE_NAME='central_disbursement_transfer' THEN
  SELECT * INTO d FROM central_disbursement WHERE id=NEW.disbursement_id;
  IF NEW.simulated IS DISTINCT FROM (d.environment='DEMO') OR NEW.actor_id=d.created_by OR
   NOT EXISTS(SELECT 1 FROM central_disbursement_event x WHERE x.disbursement_id=d.id AND x.action='APPROVE') OR
   EXISTS(SELECT 1 FROM central_disbursement_event x WHERE x.disbursement_id=d.id AND x.action IN ('WITHDRAW','REJECT')) THEN RAISE EXCEPTION 'Disbursement transfer requires independent approval and matching environment'; END IF;
  IF NOT NEW.simulated AND NOT EXISTS(SELECT 1 FROM central_disbursement_file f WHERE f.id=NEW.file_id AND f.uploaded_by=NEW.actor_id AND f.request_id=NEW.request_id) THEN RAISE EXCEPTION 'Transfer evidence must belong to its recorder'; END IF;
 ELSIF TG_TABLE_NAME='central_disbursement_confirmation' THEN
  SELECT * INTO t FROM central_disbursement_transfer WHERE id=NEW.transfer_id;
  SELECT * INTO d FROM central_disbursement WHERE id=NEW.disbursement_id;
  IF NEW.actor_id=t.actor_id OR NOT EXISTS(SELECT 1 FROM agency a WHERE a.id=d.agency_id AND (a.owner_id=NEW.actor_id OR EXISTS(SELECT 1 FROM agency_member m WHERE m.agency_id=a.id AND m.actor_id=NEW.actor_id AND m.active))) THEN RAISE EXCEPTION 'Agency receipt confirmation must be independent from transfer execution'; END IF;
 ELSIF TG_TABLE_NAME='central_disbursement_release' THEN
  SELECT * INTO d FROM central_disbursement WHERE id=NEW.disbursement_id;
  SELECT * INTO e FROM booking_revenue_entry WHERE id=NEW.entry_id;
  SELECT item INTO original FROM jsonb_array_elements(d.body->'sources') item WHERE item->>'entryId'=NEW.entry_id::text;
  IF e.close_id IS DISTINCT FROM d.close_id OR e.request_id IS DISTINCT FROM d.request_id OR e.agency_id IS DISTINCT FROM d.agency_id OR e.environment IS DISTINCT FROM d.environment OR e.recipient='PLATFORM' OR original IS NULL OR (original->>'proposedDisbursementCentavos')::bigint IS DISTINCT FROM NEW.amount_centavos OR NEW.amount_centavos>e.amount_centavos THEN RAISE EXCEPTION 'Release must preserve the exact confirmed allocation source'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER central_transfer_integrity BEFORE INSERT ON central_disbursement_transfer FOR EACH ROW EXECUTE FUNCTION central_disbursement_integrity();
CREATE TRIGGER central_confirmation_integrity BEFORE INSERT ON central_disbursement_confirmation FOR EACH ROW EXECUTE FUNCTION central_disbursement_integrity();
CREATE TRIGGER central_release_integrity BEFORE INSERT ON central_disbursement_release FOR EACH ROW EXECUTE FUNCTION central_disbursement_integrity();
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['central_disbursement','central_disbursement_event','central_disbursement_file','central_disbursement_transfer','central_disbursement_confirmation','central_disbursement_release','central_disbursement_command'] LOOP
  EXECUTE format('CREATE TRIGGER immutable_%I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION app_immutable()',name,name);
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN
  GRANT SELECT,INSERT,UPDATE ON central_disbursement_account TO rent2go_app;
  GRANT SELECT,INSERT ON central_disbursement,central_disbursement_event,central_disbursement_file,central_disbursement_transfer,central_disbursement_confirmation,central_disbursement_release,central_disbursement_command TO rent2go_app;
 END IF;
END $$;
-- Independent of deferred gateway tables, so the accepted primary baseline can
-- install this additive release interface before payment activation.
CREATE FUNCTION central_owner_released(entry uuid) RETURNS bigint LANGUAGE sql STABLE AS $$ SELECT COALESCE(sum(amount_centavos),0)::bigint FROM central_disbursement_release WHERE entry_id=entry $$;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN GRANT EXECUTE ON FUNCTION central_owner_released(uuid) TO rent2go_app; END IF; END $$;
