-- Durable preparation only. This migration does not enable payment processing,
-- change prior collections, or substitute a provider receipt for booking posting.
CREATE TABLE paymongo_checkout (
 id uuid PRIMARY KEY,
 request_id uuid NOT NULL, quote_id uuid NOT NULL UNIQUE, agreement_id uuid NOT NULL,
 agency_id uuid NOT NULL, renter_id text NOT NULL REFERENCES app_actor(id),
 created_by text NOT NULL REFERENCES app_actor(id), request_version integer NOT NULL CHECK(request_version>0),
 agreement_digest text NOT NULL CHECK(agreement_digest ~ '^[a-f0-9]{64}$'),
 mode text NOT NULL CHECK(mode IN ('test','live')),
 merchant_fingerprint text NOT NULL CHECK(merchant_fingerprint ~ '^[a-f0-9]{64}$'),
 amount_centavos bigint NOT NULL CHECK(amount_centavos BETWEEN 1 AND 9007199254740991),
 idempotency_key uuid NOT NULL, command_digest text NOT NULL CHECK(command_digest ~ '^[a-f0-9]{64}$'),
 provider_idempotency_key uuid NOT NULL UNIQUE,
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(request_id,agency_id) REFERENCES booking_request(id,agency_id),
 FOREIGN KEY(agreement_id,request_id,quote_id) REFERENCES booking_agreement(id,request_id,quote_id),
 UNIQUE(request_id,created_by,idempotency_key),
 UNIQUE(id,mode,merchant_fingerprint),
 CHECK(created_by=renter_id)
);
CREATE TABLE paymongo_checkout_link (
 checkout_id uuid PRIMARY KEY, mode text NOT NULL, merchant_fingerprint text NOT NULL,
 provider_id text NOT NULL CHECK(provider_id ~ '^cs_[A-Za-z0-9]+$'),
 checkout_url text NOT NULL CHECK(length(checkout_url) BETWEEN 1 AND 2000),
 linked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(checkout_id,mode,merchant_fingerprint) REFERENCES paymongo_checkout(id,mode,merchant_fingerprint),
 UNIQUE(mode,merchant_fingerprint,provider_id)
);
CREATE TRIGGER immutable_paymongo_checkout BEFORE UPDATE OR DELETE ON paymongo_checkout FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_paymongo_checkout_link BEFORE UPDATE OR DELETE ON paymongo_checkout_link FOR EACH ROW EXECUTE FUNCTION app_immutable();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN
 GRANT SELECT,INSERT ON paymongo_checkout,paymongo_checkout_link TO rent2go_app;
END IF; END $$;
