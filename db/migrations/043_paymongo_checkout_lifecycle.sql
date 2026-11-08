ALTER TABLE paymongo_checkout ADD UNIQUE(id,amount_centavos);
ALTER TABLE paymongo_checkout_link ADD UNIQUE(checkout_id,provider_id);
ALTER TABLE paymongo_checkout_link ADD CONSTRAINT paymongo_hosted_origin CHECK(checkout_url ~ '^https://checkout[.]paymongo[.]com/[^[:space:]]+$');
CREATE TABLE paymongo_checkout_state (
 checkout_id uuid PRIMARY KEY REFERENCES paymongo_checkout(id),
 first_dispatch_at timestamptz,
 expiry_idempotency_key uuid NOT NULL DEFAULT gen_random_uuid(),
 lease_nonce uuid, lease_until timestamptz,
 next_poll_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 review_required boolean NOT NULL DEFAULT false,
 last_error text CHECK(last_error IN ('PROVIDER_UNAVAILABLE','SOURCE_CLOSED','CREATION_WINDOW_CLOSED','PROVIDER_MISMATCH','EXPIRY_PENDING')),
 CHECK((lease_nonce IS NULL)=(lease_until IS NULL)),
 CHECK(first_dispatch_at IS NULL OR isfinite(first_dispatch_at))
);
CREATE FUNCTION paymongo_state_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.checkout_id IS DISTINCT FROM OLD.checkout_id OR NEW.expiry_idempotency_key IS DISTINCT FROM OLD.expiry_idempotency_key OR (OLD.first_dispatch_at IS NOT NULL AND NEW.first_dispatch_at IS DISTINCT FROM OLD.first_dispatch_at) OR (OLD.review_required AND NOT NEW.review_required) THEN
  RAISE EXCEPTION 'Preserve checkout identity, first dispatch and required review' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER paymongo_state_guard BEFORE UPDATE ON paymongo_checkout_state FOR EACH ROW EXECUTE FUNCTION paymongo_state_guard();
CREATE TABLE paymongo_checkout_dispatch (
 id uuid PRIMARY KEY, checkout_id uuid NOT NULL REFERENCES paymongo_checkout(id),
 lease_nonce uuid NOT NULL UNIQUE, action text NOT NULL CHECK(action IN ('CREATE','RETRIEVE')),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE paymongo_checkout_observation (
 id uuid PRIMARY KEY, checkout_id uuid NOT NULL, provider_id text NOT NULL,
 status text NOT NULL CHECK(status IN ('active','expired')), paid boolean NOT NULL,
 projection_digest text NOT NULL CHECK(projection_digest ~ '^[a-f0-9]{64}$'),
 observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(checkout_id,provider_id) REFERENCES paymongo_checkout_link(checkout_id,provider_id),
 UNIQUE(checkout_id,projection_digest)
);
CREATE TABLE paymongo_checkout_payment (
 id uuid PRIMARY KEY, checkout_id uuid NOT NULL UNIQUE, provider_id text NOT NULL,
 mode text NOT NULL, merchant_fingerprint text NOT NULL,
 payment_id text NOT NULL CHECK(payment_id ~ '^pay_[A-Za-z0-9]+$'),
 amount_centavos bigint NOT NULL, fee_centavos bigint NOT NULL CHECK(fee_centavos>=0), net_centavos bigint NOT NULL CHECK(net_centavos>=0),
 method text NOT NULL CHECK(method IN ('card','gcash','qrph','paymaya','grab_pay')),
 requires_reconciliation boolean NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(checkout_id,provider_id) REFERENCES paymongo_checkout_link(checkout_id,provider_id),
 FOREIGN KEY(checkout_id,mode,merchant_fingerprint) REFERENCES paymongo_checkout(id,mode,merchant_fingerprint),
 FOREIGN KEY(checkout_id,amount_centavos) REFERENCES paymongo_checkout(id,amount_centavos),
 UNIQUE(mode,merchant_fingerprint,payment_id),
 CHECK(fee_centavos+net_centavos=amount_centavos)
);
CREATE TABLE paymongo_checkout_end (
 checkout_id uuid PRIMARY KEY REFERENCES paymongo_checkout(id),
 kind text NOT NULL CHECK(kind IN ('EXPIRED','ABANDONED_BEFORE_DISPATCH')),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['paymongo_checkout_dispatch','paymongo_checkout_observation','paymongo_checkout_payment','paymongo_checkout_end'] LOOP
  EXECUTE format('CREATE TRIGGER immutable_%I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION app_immutable()',t,t);
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN
  GRANT SELECT,INSERT ON paymongo_checkout_state,paymongo_checkout_dispatch,paymongo_checkout_observation,paymongo_checkout_payment,paymongo_checkout_end TO rent2go_app;
  GRANT UPDATE(first_dispatch_at,lease_nonce,lease_until,next_poll_at,review_required,last_error) ON paymongo_checkout_state TO rent2go_app;
 END IF;
END $$;
