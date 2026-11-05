ALTER TABLE booking_request DROP CONSTRAINT booking_request_status_check;
ALTER TABLE booking_request ADD CONSTRAINT booking_request_status_check CHECK(status IN ('REQUIREMENTS_PENDING','UNDER_REVIEW','CHANGES_REQUESTED','READY_FOR_APPROVAL','REJECTED','QUOTE_PENDING','QUOTE_ACCEPTED','QUOTE_DECLINED','HOLD_EXPIRED'));
CREATE TABLE booking_quotation (
 id uuid PRIMARY KEY, request_id uuid NOT NULL REFERENCES booking_request(id), revision integer NOT NULL CHECK(revision>0),
 digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'), issued_by text NOT NULL REFERENCES app_actor(id),
 issued_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, public_snapshot jsonb NOT NULL CHECK(jsonb_typeof(public_snapshot)='object'),
 UNIQUE(request_id,revision), UNIQUE(id,request_id), CHECK(isfinite(issued_at) AND isfinite(expires_at) AND expires_at>issued_at)
);
ALTER TABLE booking_request_line ADD UNIQUE(id,request_id);
CREATE TABLE booking_quotation_line (
 quote_id uuid NOT NULL, request_id uuid NOT NULL, line_id uuid NOT NULL,
 public_snapshot jsonb NOT NULL CHECK(jsonb_typeof(public_snapshot)='object'),
 private_financial_snapshot jsonb NOT NULL CHECK(jsonb_typeof(private_financial_snapshot)='object'), PRIMARY KEY(quote_id,line_id),
 FOREIGN KEY(quote_id,request_id) REFERENCES booking_quotation(id,request_id), FOREIGN KEY(line_id,request_id) REFERENCES booking_request_line(id,request_id)
);
CREATE TABLE booking_hold (
 id uuid PRIMARY KEY, request_id uuid NOT NULL REFERENCES booking_request(id), quote_id uuid NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), released_at timestamptz, release_reason text,
 FOREIGN KEY(quote_id,request_id) REFERENCES booking_quotation(id,request_id), UNIQUE(id,quote_id),
 CHECK((released_at IS NULL AND release_reason IS NULL) OR (released_at IS NOT NULL AND release_reason IN ('EXPIRED','DECLINED','WITHDRAWN')))
);
CREATE UNIQUE INDEX booking_one_active_hold ON booking_hold(request_id) WHERE released_at IS NULL;
CREATE INDEX booking_expiry_candidates ON booking_hold(expires_at,request_id) WHERE released_at IS NULL;
CREATE TABLE booking_hold_resource (
 hold_id uuid NOT NULL, quote_id uuid NOT NULL, occupation_id uuid NOT NULL UNIQUE REFERENCES resource_occupation(id),
 line_id uuid NOT NULL, PRIMARY KEY(hold_id,occupation_id),
 FOREIGN KEY(hold_id,quote_id) REFERENCES booking_hold(id,quote_id), FOREIGN KEY(quote_id,line_id) REFERENCES booking_quotation_line(quote_id,line_id)
);
CREATE TABLE booking_hold_seat (
 hold_id uuid NOT NULL, quote_id uuid NOT NULL, line_id uuid NOT NULL,
 schedule_id uuid NOT NULL REFERENCES tour_schedule(id), units integer NOT NULL CHECK(units>0), PRIMARY KEY(hold_id,line_id),
 FOREIGN KEY(hold_id,quote_id) REFERENCES booking_hold(id,quote_id), FOREIGN KEY(quote_id,line_id) REFERENCES booking_quotation_line(quote_id,line_id)
);
CREATE TABLE booking_quotation_decision (
 id uuid PRIMARY KEY, quote_id uuid NOT NULL REFERENCES booking_quotation(id), actor_id text NOT NULL REFERENCES app_actor(id),
 action text NOT NULL CHECK(action IN ('ACCEPTED','DECLINED','WITHDRAWN','EXPIRED')), reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(quote_id,action)
);
CREATE FUNCTION preserve_booking_hold() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Booking hold history cannot be deleted'; END IF;
 IF ROW(NEW.id,NEW.request_id,NEW.quote_id,NEW.expires_at,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.request_id,OLD.quote_id,OLD.expires_at,OLD.created_at)
 OR OLD.released_at IS NOT NULL OR NEW.released_at IS NULL THEN RAISE EXCEPTION 'Only one explicit release may change a booking hold'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER preserve_booking_hold BEFORE UPDATE OR DELETE ON booking_hold FOR EACH ROW EXECUTE FUNCTION preserve_booking_hold();
CREATE TRIGGER immutable_booking_quotation BEFORE UPDATE OR DELETE ON booking_quotation FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_booking_quotation_line BEFORE UPDATE OR DELETE ON booking_quotation_line FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_booking_hold_resource BEFORE UPDATE OR DELETE ON booking_hold_resource FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_booking_hold_seat BEFORE UPDATE OR DELETE ON booking_hold_seat FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_booking_quotation_decision BEFORE UPDATE OR DELETE ON booking_quotation_decision FOR EACH ROW EXECUTE FUNCTION app_immutable();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN
 GRANT SELECT,INSERT ON booking_quotation,booking_quotation_line,booking_hold_resource,booking_hold_seat,booking_quotation_decision TO rent2go_app;
 GRANT SELECT,INSERT ON booking_hold TO rent2go_app;
 GRANT UPDATE(released_at,release_reason) ON booking_hold TO rent2go_app;
END IF; END $$;
