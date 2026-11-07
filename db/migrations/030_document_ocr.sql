CREATE TABLE booking_ocr_command (
 id uuid PRIMARY KEY,file_id uuid NOT NULL REFERENCES booking_requirement_file(id),actor_id text NOT NULL REFERENCES app_actor(id),idempotency_key uuid NOT NULL,digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),action text NOT NULL CHECK(action IN ('EXTRACT','REVOKE','COMPARE','CLOSE_STALLED')),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(file_id,actor_id,idempotency_key)
);
CREATE TABLE booking_ocr_consent (
 id uuid PRIMARY KEY,file_id uuid NOT NULL REFERENCES booking_requirement_file(id),actor_id text NOT NULL REFERENCES app_actor(id),command_id uuid NOT NULL REFERENCES booking_ocr_command(id),decision text NOT NULL CHECK(decision IN ('ALLOW','REVOKE')),policy_version text NOT NULL CHECK(policy_version='ocr-space-v1'),file_sha256 text NOT NULL CHECK(file_sha256 ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(id,file_id)
);
CREATE INDEX booking_ocr_consent_latest ON booking_ocr_consent(file_id,created_at DESC,id DESC);
CREATE TABLE booking_ocr_job (
 id uuid PRIMARY KEY,request_id uuid NOT NULL,file_id uuid NOT NULL,actor_id text NOT NULL REFERENCES app_actor(id),command_id uuid NOT NULL UNIQUE REFERENCES booking_ocr_command(id),consent_id uuid NOT NULL,file_sha256 text NOT NULL CHECK(file_sha256 ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),deadline_at timestamptz NOT NULL DEFAULT(clock_timestamp()+interval '2 minutes'),dispatch_at timestamptz,ended_at timestamptz,
 FOREIGN KEY(file_id,request_id) REFERENCES booking_requirement_file(id,request_id),FOREIGN KEY(consent_id,file_id) REFERENCES booking_ocr_consent(id,file_id),UNIQUE(id,file_id),CHECK(deadline_at>created_at)
);
CREATE UNIQUE INDEX booking_ocr_one_pending ON booking_ocr_job(file_id) WHERE ended_at IS NULL;
CREATE INDEX booking_ocr_job_history ON booking_ocr_job(file_id,created_at DESC,id DESC);
CREATE TABLE booking_ocr_result (
 job_id uuid PRIMARY KEY REFERENCES booking_ocr_job(id),outcome text NOT NULL CHECK(outcome IN ('SUCCEEDED','PARTIAL','FAILED','CANCELLED','UNKNOWN')),text_content text NOT NULL CHECK(length(text_content)<=20000),page_count integer NOT NULL CHECK(page_count BETWEEN 0 AND 3),reason_code text NOT NULL CHECK(reason_code IN ('OK','PARTIAL','NO_TEXT','PROVIDER_ERROR','UNAVAILABLE','TIMEOUT','INVALID_RESPONSE','OUTPUT_LIMIT','FILE_MISMATCH','SOURCE_CHANGED','CONSENT_CHANGED','ACCESS_CHANGED','STOPPED')),provider_code integer,digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),CHECK(outcome IN ('SUCCEEDED','PARTIAL') OR text_content='')
);
CREATE TABLE booking_ocr_review (
 id uuid PRIMARY KEY,job_id uuid NOT NULL UNIQUE REFERENCES booking_ocr_result(job_id),actor_id text NOT NULL REFERENCES app_actor(id),command_id uuid NOT NULL UNIQUE REFERENCES booking_ocr_command(id),result_digest text NOT NULL CHECK(result_digest ~ '^[a-f0-9]{64}$'),decision text NOT NULL CHECK(decision IN ('COMPARED','UNUSABLE')),note text NOT NULL CHECK(length(note)<=2000),acknowledged boolean NOT NULL CHECK(acknowledged),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION validate_ocr_consent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM booking_requirement_file f JOIN booking_request r ON r.id=f.request_id WHERE f.id=NEW.file_id AND f.uploader_id=NEW.actor_id AND r.renter_id=NEW.actor_id AND f.sha256=NEW.file_sha256) THEN RAISE EXCEPTION 'OCR consent must match the exact uploader and document'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_ocr_consent BEFORE INSERT ON booking_ocr_consent FOR EACH ROW EXECUTE FUNCTION validate_ocr_consent();
CREATE FUNCTION protect_ocr_job() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'dispatch_at'-'ended_at')<>(to_jsonb(OLD)-'dispatch_at'-'ended_at') OR (OLD.dispatch_at IS NOT NULL AND NEW.dispatch_at IS DISTINCT FROM OLD.dispatch_at) OR (OLD.ended_at IS NOT NULL AND NEW.ended_at IS DISTINCT FROM OLD.ended_at) OR (NEW.ended_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM booking_ocr_result WHERE job_id=NEW.id)) OR (NEW.dispatch_at IS DISTINCT FROM OLD.dispatch_at AND (OLD.ended_at IS NOT NULL OR clock_timestamp()>=OLD.deadline_at)) THEN RAISE EXCEPTION 'OCR source, dispatch and terminal result are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_ocr_job BEFORE UPDATE OR DELETE ON booking_ocr_job FOR EACH ROW EXECUTE FUNCTION protect_ocr_job();
CREATE FUNCTION finish_ocr_job() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE booking_ocr_job SET ended_at=clock_timestamp() WHERE id=NEW.job_id AND ended_at IS NULL; RETURN NEW; END $$;
CREATE TRIGGER close_ocr_result AFTER INSERT ON booking_ocr_result FOR EACH ROW EXECUTE FUNCTION finish_ocr_job();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['booking_ocr_command','booking_ocr_consent','booking_ocr_result','booking_ocr_review'] LOOP
  EXECUTE format('CREATE TRIGGER immutable_%I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION app_immutable()',t,t);
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN GRANT SELECT,INSERT ON booking_ocr_command,booking_ocr_consent,booking_ocr_job,booking_ocr_result,booking_ocr_review TO rent2go_app; GRANT UPDATE(dispatch_at,ended_at) ON booking_ocr_job TO rent2go_app; END IF;
END $$;
