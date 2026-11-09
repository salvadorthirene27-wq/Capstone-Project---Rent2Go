CREATE TABLE central_funding_file (
 id uuid PRIMARY KEY,request_id uuid NOT NULL REFERENCES booking_request(id),uploaded_by text NOT NULL REFERENCES app_actor(id),mime text NOT NULL CHECK(mime IN ('image/png','image/jpeg','application/pdf')),size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880),sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),backend text NOT NULL CHECK(backend IN ('local','s3')),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(id,request_id)
);
CREATE TABLE central_agency_funding (
 id uuid PRIMARY KEY,request_id uuid NOT NULL REFERENCES booking_request(id),agency_id uuid NOT NULL REFERENCES agency(id),environment text NOT NULL CHECK(environment IN ('DEMO','MANUAL')),amount_centavos bigint NOT NULL CHECK(amount_centavos BETWEEN 1 AND 9007199254740991),source_digest text NOT NULL CHECK(source_digest ~ '^[a-f0-9]{64}$'),body jsonb NOT NULL CHECK(jsonb_typeof(body)='object'),created_by text NOT NULL REFERENCES app_actor(id),reference text NOT NULL CHECK(length(trim(reference)) BETWEEN 1 AND 160),normalized_reference text NOT NULL,reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),file_id uuid,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(id,request_id),UNIQUE(environment,normalized_reference),FOREIGN KEY(file_id,request_id) REFERENCES central_funding_file(id,request_id),CHECK((environment='DEMO')=(file_id IS NULL))
);
CREATE TABLE central_funding_decision (
 funding_id uuid PRIMARY KEY REFERENCES central_agency_funding(id),actor_id text NOT NULL REFERENCES app_actor(id),decision text NOT NULL CHECK(decision IN ('APPROVE','REJECT')),reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE central_funding_command (
 request_id uuid NOT NULL REFERENCES booking_request(id),actor_id text NOT NULL REFERENCES app_actor(id),idempotency_key uuid NOT NULL,digest text NOT NULL,funding_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(request_id,actor_id,idempotency_key),FOREIGN KEY(funding_id,request_id) REFERENCES central_agency_funding(id,request_id)
);
CREATE FUNCTION central_funding_independence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.actor_id=(SELECT created_by FROM central_agency_funding WHERE id=NEW.funding_id) THEN RAISE EXCEPTION 'Funding verification requires independent review';END IF;RETURN NEW;END $$;
CREATE TRIGGER central_funding_independence BEFORE INSERT ON central_funding_decision FOR EACH ROW EXECUTE FUNCTION central_funding_independence();
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['central_funding_file','central_agency_funding','central_funding_decision','central_funding_command'] LOOP EXECUTE format('CREATE TRIGGER immutable_%I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION app_immutable()',t,t);END LOOP;IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN GRANT SELECT,INSERT ON central_funding_file,central_agency_funding,central_funding_decision,central_funding_command TO rent2go_app;END IF;END $$;
