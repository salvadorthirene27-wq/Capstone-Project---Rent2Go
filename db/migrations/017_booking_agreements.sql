ALTER TABLE booking_request DROP CONSTRAINT booking_request_status_check;
ALTER TABLE booking_request ADD CONSTRAINT booking_request_status_check CHECK(status IN ('REQUIREMENTS_PENDING','UNDER_REVIEW','CHANGES_REQUESTED','READY_FOR_APPROVAL','REJECTED','QUOTE_PENDING','QUOTE_ACCEPTED','QUOTE_DECLINED','HOLD_EXPIRED','AGREEMENT_PENDING','AGREEMENT_SIGNED'));
CREATE TABLE booking_agreement (
 id uuid PRIMARY KEY, request_id uuid NOT NULL, quote_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0), digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
 quote_digest text NOT NULL CHECK(quote_digest ~ '^[a-f0-9]{64}$'), template_version text NOT NULL,
 issued_by text NOT NULL REFERENCES app_actor(id), issued_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 body jsonb NOT NULL CHECK(jsonb_typeof(body)='object'), private_contact_snapshot jsonb NOT NULL CHECK(jsonb_typeof(private_contact_snapshot)='object'),
 FOREIGN KEY(quote_id,request_id) REFERENCES booking_quotation(id,request_id),
 UNIQUE(request_id,revision), UNIQUE(id,request_id), UNIQUE(id,request_id,quote_id),
 CHECK(isfinite(issued_at) AND isfinite(expires_at) AND expires_at>issued_at)
);
CREATE TABLE booking_agreement_signature (
 id uuid PRIMARY KEY, agreement_id uuid NOT NULL UNIQUE, request_id uuid NOT NULL, quote_id uuid NOT NULL,
 agreement_digest text NOT NULL CHECK(agreement_digest ~ '^[a-f0-9]{64}$'), signer_id text NOT NULL REFERENCES app_actor(id), signer_name text NOT NULL CHECK(length(trim(signer_name)) BETWEEN 1 AND 160),
 consent boolean NOT NULL CHECK(consent), signed_at timestamptz NOT NULL,
 mime text NOT NULL CHECK(mime IN ('image/png','image/jpeg')), size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 1048576),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'), backend text NOT NULL CHECK(backend IN ('local','s3')),
 FOREIGN KEY(agreement_id,request_id,quote_id) REFERENCES booking_agreement(id,request_id,quote_id),
 UNIQUE(id,agreement_id), CHECK(isfinite(signed_at))
);
CREATE TABLE booking_agreement_event (
 id uuid PRIMARY KEY, agreement_id uuid NOT NULL, request_id uuid NOT NULL, actor_id text NOT NULL REFERENCES app_actor(id),
 action text NOT NULL CHECK(action IN ('ISSUED','WITHDRAWN','SIGNED')), reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(agreement_id,request_id) REFERENCES booking_agreement(id,request_id), UNIQUE(agreement_id,action)
);
CREATE TRIGGER immutable_booking_agreement BEFORE UPDATE OR DELETE ON booking_agreement FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_booking_agreement_signature BEFORE UPDATE OR DELETE ON booking_agreement_signature FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_booking_agreement_event BEFORE UPDATE OR DELETE ON booking_agreement_event FOR EACH ROW EXECUTE FUNCTION app_immutable();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN
 GRANT SELECT,INSERT ON booking_agreement,booking_agreement_signature,booking_agreement_event TO rent2go_app;
END IF; END $$;
