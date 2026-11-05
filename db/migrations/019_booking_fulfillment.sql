ALTER TABLE booking_request DROP CONSTRAINT booking_request_status_check;
ALTER TABLE booking_request ADD CONSTRAINT booking_request_status_check CHECK(status IN ('REQUIREMENTS_PENDING','UNDER_REVIEW','CHANGES_REQUESTED','READY_FOR_APPROVAL','REJECTED','QUOTE_PENDING','QUOTE_ACCEPTED','QUOTE_DECLINED','HOLD_EXPIRED','AGREEMENT_PENDING','AGREEMENT_SIGNED','PAYMENT_PARTIAL','READY_FOR_SERVICE','PAYMENT_RECONCILIATION_REQUIRED','SERVICE_ACTIVE','FULFILLMENT_RECONCILIATION_PENDING'));
ALTER TABLE booking_quotation_line ADD UNIQUE(quote_id,request_id,line_id);
CREATE TABLE booking_fulfillment_command(
 id uuid PRIMARY KEY,request_id uuid NOT NULL REFERENCES booking_request(id),actor_id text NOT NULL REFERENCES app_actor(id),idempotency_key uuid NOT NULL,digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(request_id,actor_id,idempotency_key)
);
CREATE TABLE booking_inspection_file(
 id uuid PRIMARY KEY,request_id uuid NOT NULL,quote_id uuid NOT NULL,line_id uuid NOT NULL,phase text NOT NULL CHECK(phase IN ('PRE','POST')),uploader_id text NOT NULL REFERENCES app_actor(id),mime text NOT NULL CHECK(mime IN ('image/png','image/jpeg')),size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880),sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),backend text NOT NULL CHECK(backend IN ('s3','local')),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(quote_id,request_id,line_id) REFERENCES booking_quotation_line(quote_id,request_id,line_id),UNIQUE(id,request_id,quote_id,line_id,phase)
);
CREATE TABLE booking_inspection(
 id uuid PRIMARY KEY,request_id uuid NOT NULL,quote_id uuid NOT NULL,line_id uuid NOT NULL,phase text NOT NULL CHECK(phase IN ('PRE','POST')),revision integer NOT NULL CHECK(revision>0),body jsonb NOT NULL CHECK(jsonb_typeof(body)='object'),digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),actor_id text NOT NULL REFERENCES app_actor(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(quote_id,request_id,line_id) REFERENCES booking_quotation_line(quote_id,request_id,line_id),UNIQUE(quote_id,line_id,phase,revision),UNIQUE(id,request_id,quote_id,line_id,phase),UNIQUE(id,request_id)
);
CREATE TABLE booking_inspection_photo(
 inspection_id uuid NOT NULL,request_id uuid NOT NULL,quote_id uuid NOT NULL,line_id uuid NOT NULL,phase text NOT NULL,file_id uuid NOT NULL,
 PRIMARY KEY(inspection_id,file_id),FOREIGN KEY(inspection_id,request_id,quote_id,line_id,phase) REFERENCES booking_inspection(id,request_id,quote_id,line_id,phase),FOREIGN KEY(file_id,request_id,quote_id,line_id,phase) REFERENCES booking_inspection_file(id,request_id,quote_id,line_id,phase)
);
CREATE TABLE booking_inspection_ack(
 id uuid PRIMARY KEY,inspection_id uuid NOT NULL UNIQUE,request_id uuid NOT NULL,actor_id text NOT NULL REFERENCES app_actor(id),decision text NOT NULL CHECK(decision IN ('ACCEPT','DISPUTE')),reason text NOT NULL CHECK(length(reason)<=2000 AND (decision<>'DISPUTE' OR length(trim(reason))>0)),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(inspection_id,request_id) REFERENCES booking_inspection(id,request_id)
);
CREATE TABLE booking_fulfillment_event(
 id uuid PRIMARY KEY,request_id uuid NOT NULL,quote_id uuid NOT NULL,line_id uuid NOT NULL,actor_id text NOT NULL REFERENCES app_actor(id),action text NOT NULL CHECK(action IN ('RELEASE_RENTAL','RECORD_RETURN','START_TOUR','COMPLETE_TOUR')),details jsonb NOT NULL CHECK(jsonb_typeof(details)='object'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(quote_id,request_id,line_id) REFERENCES booking_quotation_line(quote_id,request_id,line_id),UNIQUE(quote_id,line_id,action)
);
CREATE TABLE booking_actual_occupation(
 id uuid PRIMARY KEY,resource_id uuid NOT NULL REFERENCES resource(id),request_id uuid NOT NULL,quote_id uuid NOT NULL,line_id uuid NOT NULL,opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),planned_end timestamptz NOT NULL,closed_at timestamptz,available_at timestamptz,
 FOREIGN KEY(quote_id,request_id,line_id) REFERENCES booking_quotation_line(quote_id,request_id,line_id),UNIQUE(quote_id,line_id,resource_id),CHECK(isfinite(opened_at) AND isfinite(planned_end) AND planned_end>opened_at),CHECK((closed_at IS NULL AND available_at IS NULL) OR (closed_at IS NOT NULL AND available_at IS NOT NULL AND isfinite(closed_at) AND isfinite(available_at) AND closed_at>=opened_at AND available_at>=closed_at))
);
CREATE UNIQUE INDEX booking_one_actual_active ON booking_actual_occupation(resource_id) WHERE closed_at IS NULL;
CREATE FUNCTION preserve_actual_occupation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Actual occupancy history is retained'; END IF;
 IF ROW(NEW.id,NEW.resource_id,NEW.request_id,NEW.quote_id,NEW.line_id,NEW.opened_at,NEW.planned_end) IS DISTINCT FROM ROW(OLD.id,OLD.resource_id,OLD.request_id,OLD.quote_id,OLD.line_id,OLD.opened_at,OLD.planned_end) OR OLD.closed_at IS NOT NULL OR NEW.closed_at IS NULL OR NEW.available_at IS NULL THEN RAISE EXCEPTION 'Actual occupancy may only close once'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER preserve_actual_occupation BEFORE UPDATE OR DELETE ON booking_actual_occupation FOR EACH ROW EXECUTE FUNCTION preserve_actual_occupation();
CREATE FUNCTION booking_actual_resource_conflict(target uuid,start_time timestamptz,end_time timestamptz) RETURNS boolean LANGUAGE sql VOLATILE AS $$
 SELECT EXISTS(SELECT 1 FROM booking_actual_occupation a WHERE a.resource_id=target AND ((a.closed_at IS NULL AND (a.planned_end<=clock_timestamp() OR tstzrange(a.opened_at,a.planned_end,'[)') && tstzrange(start_time,end_time,'[)'))) OR (a.closed_at IS NOT NULL AND tstzrange(a.opened_at,a.available_at,'[)') && tstzrange(start_time,end_time,'[)'))))
$$;
CREATE TRIGGER immutable_fulfillment_command BEFORE UPDATE OR DELETE ON booking_fulfillment_command FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_inspection_file BEFORE UPDATE OR DELETE ON booking_inspection_file FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_inspection BEFORE UPDATE OR DELETE ON booking_inspection FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_inspection_photo BEFORE UPDATE OR DELETE ON booking_inspection_photo FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_inspection_ack BEFORE UPDATE OR DELETE ON booking_inspection_ack FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_fulfillment_event BEFORE UPDATE OR DELETE ON booking_fulfillment_event FOR EACH ROW EXECUTE FUNCTION app_immutable();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN
 GRANT SELECT,INSERT ON booking_fulfillment_command,booking_inspection_file,booking_inspection,booking_inspection_photo,booking_inspection_ack,booking_fulfillment_event,booking_actual_occupation TO rent2go_app;
 GRANT UPDATE(closed_at,available_at) ON booking_actual_occupation TO rent2go_app;
END IF; END $$;
