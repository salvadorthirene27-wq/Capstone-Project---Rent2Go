ALTER TABLE booking_request DROP CONSTRAINT booking_request_status_check;
ALTER TABLE booking_request ADD CONSTRAINT booking_request_status_check CHECK(status IN ('REQUIREMENTS_PENDING','UNDER_REVIEW','CHANGES_REQUESTED','READY_FOR_APPROVAL','REJECTED'));
CREATE TABLE booking_requirement_file (
 id uuid PRIMARY KEY, request_id uuid NOT NULL REFERENCES booking_request(id), uploader_id text NOT NULL REFERENCES app_actor(id),
 purpose text NOT NULL CHECK(purpose IN ('IDENTITY','DRIVER_LICENSE')), name text NOT NULL, mime text NOT NULL CHECK(mime IN ('image/png','image/jpeg','application/pdf')), size integer NOT NULL CHECK(size BETWEEN 1 AND 8388608), sha256 text NOT NULL, backend text NOT NULL CHECK(backend IN ('local','s3')), expires_on date, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,request_id), CHECK(length(name) BETWEEN 1 AND 160)
);
CREATE INDEX booking_requirement_file_request ON booking_requirement_file(request_id,created_at DESC);
CREATE TABLE booking_requirement_submission (
 id uuid PRIMARY KEY, request_id uuid NOT NULL REFERENCES booking_request(id), version integer NOT NULL, actor_id text NOT NULL REFERENCES app_actor(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(request_id,version), UNIQUE(id,request_id)
);
CREATE TABLE booking_requirement_selection (
 submission_id uuid NOT NULL, request_id uuid NOT NULL, purpose text NOT NULL CHECK(purpose IN ('IDENTITY','DRIVER_LICENSE')), file_id uuid NOT NULL,
 PRIMARY KEY(submission_id,purpose), UNIQUE(submission_id,file_id), FOREIGN KEY(submission_id,request_id) REFERENCES booking_requirement_submission(id,request_id), FOREIGN KEY(file_id,request_id) REFERENCES booking_requirement_file(id,request_id)
);
CREATE TABLE booking_requirement_decision (
 id uuid PRIMARY KEY, submission_id uuid NOT NULL REFERENCES booking_requirement_submission(id), file_id uuid NOT NULL REFERENCES booking_requirement_file(id), reviewer_id text NOT NULL REFERENCES app_actor(id), decision text NOT NULL CHECK(decision IN ('ACCEPTED','CHANGES_REQUESTED')), reason text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(submission_id,file_id), FOREIGN KEY(submission_id,file_id) REFERENCES booking_requirement_selection(submission_id,file_id)
);

CREATE TRIGGER immutable_booking_requirement_file BEFORE UPDATE OR DELETE ON booking_requirement_file FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_booking_requirement_submission BEFORE UPDATE OR DELETE ON booking_requirement_submission FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_booking_requirement_selection BEFORE UPDATE OR DELETE ON booking_requirement_selection FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_booking_requirement_decision BEFORE UPDATE OR DELETE ON booking_requirement_decision FOR EACH ROW EXECUTE FUNCTION app_immutable();
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN
 GRANT SELECT,INSERT ON booking_requirement_file,booking_requirement_submission,booking_requirement_selection,booking_requirement_decision TO rent2go_app;
 END IF;
END $$;
