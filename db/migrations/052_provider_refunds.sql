INSERT INTO app_actor(id,email,name,role,suspended,is_test_fixture)VALUES('system:paymongo-refund','paymongo-refund@system.invalid','PayMongo refund reconciliation','RENTER',true,true);
CREATE TRIGGER immutable_paymongo_refund_actor BEFORE UPDATE OR DELETE ON app_actor FOR EACH ROW WHEN(OLD.id='system:paymongo-refund') EXECUTE FUNCTION app_immutable();
CREATE TABLE paymongo_refund_intent (
 id uuid PRIMARY KEY,refund_id uuid NOT NULL REFERENCES booking_refund_request(id),request_id uuid NOT NULL REFERENCES booking_request(id),
 checkout_id uuid NOT NULL REFERENCES paymongo_checkout(id),receipt_id uuid NOT NULL REFERENCES paymongo_checkout_payment(id),
 payment_id text NOT NULL CHECK(payment_id ~ '^pay_[A-Za-z0-9]+$'),mode text NOT NULL CHECK(mode IN ('test','live')),
 merchant_fingerprint text NOT NULL CHECK(merchant_fingerprint ~ '^[a-f0-9]{64}$'),amount_centavos bigint NOT NULL CHECK(amount_centavos BETWEEN 100 AND 2147483647),
 refund_digest text NOT NULL CHECK(refund_digest ~ '^[a-f0-9]{64}$'),created_by text NOT NULL REFERENCES app_actor(id),idempotency_key uuid NOT NULL,
 provider_key uuid NOT NULL UNIQUE,command_digest text NOT NULL CHECK(command_digest ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(request_id,created_by,idempotency_key)
);
CREATE TABLE paymongo_refund_state (
 intent_id uuid PRIMARY KEY REFERENCES paymongo_refund_intent(id),status text NOT NULL DEFAULT 'PREPARED' CHECK(status IN ('PREPARED','pending','processing','succeeded','failed','ABANDONED')),
 first_dispatch_at timestamptz,lease_nonce uuid,lease_until timestamptz,next_poll_at timestamptz,review_required boolean NOT NULL DEFAULT false,last_error text
);
CREATE TABLE paymongo_refund_link (
 intent_id uuid PRIMARY KEY REFERENCES paymongo_refund_intent(id),provider_id text NOT NULL CHECK(provider_id ~ '^ref_[A-Za-z0-9]+$'),
 mode text NOT NULL CHECK(mode IN ('test','live')),merchant_fingerprint text NOT NULL CHECK(merchant_fingerprint ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(mode,merchant_fingerprint,provider_id)
);
CREATE TABLE paymongo_refund_observation (
 id uuid PRIMARY KEY,intent_id uuid NOT NULL REFERENCES paymongo_refund_intent(id),status text NOT NULL CHECK(status IN ('pending','processing','succeeded','failed')),
 body jsonb NOT NULL CHECK(jsonb_typeof(body)='object'),digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(intent_id,digest)
);
CREATE TABLE paymongo_refund_posting (
 intent_id uuid PRIMARY KEY REFERENCES paymongo_refund_intent(id),payment_id uuid NOT NULL UNIQUE REFERENCES booking_refund_payment(id),posted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE booking_refund_attempt DROP CONSTRAINT booking_refund_attempt_method_check;
ALTER TABLE booking_refund_attempt ADD CONSTRAINT booking_refund_attempt_method_check CHECK(method IN ('CASH','GCASH','DEMO_CARD','DEMO_GCASH','DEMO_PAYPAL','PAYMONGO'));
ALTER TABLE booking_refund_attempt DROP CONSTRAINT booking_refund_attempt_check;
ALTER TABLE booking_refund_attempt ADD CONSTRAINT booking_refund_attempt_check CHECK(
 (method='PAYMONGO' AND initial_outcome='CONFIRMED' AND file_id IS NULL AND mime IS NULL AND size_bytes IS NULL AND sha256 IS NULL AND backend IS NULL) OR
 (environment='DEMO' AND method IN ('DEMO_CARD','DEMO_GCASH','DEMO_PAYPAL') AND file_id IS NULL AND mime IS NULL AND size_bytes IS NULL AND sha256 IS NULL AND backend IS NULL) OR
 (environment='MANUAL' AND method IN ('CASH','GCASH') AND initial_outcome='CONFIRMED' AND file_id IS NOT NULL AND mime IS NOT NULL AND size_bytes IS NOT NULL AND sha256 IS NOT NULL AND backend IS NOT NULL AND mime IN ('image/png','image/jpeg','application/pdf') AND size_bytes BETWEEN 1 AND 5242880 AND sha256 ~ '^[a-f0-9]{64}$' AND backend IN ('local','s3'))
);
CREATE FUNCTION provider_refund_attempt_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.method='PAYMONGO' AND (NEW.actor_id<>'system:paymongo-refund' OR NOT EXISTS(
  SELECT 1 FROM booking_refund_command c JOIN paymongo_refund_intent i ON i.id=c.idempotency_key JOIN paymongo_refund_link l ON l.intent_id=i.id
  JOIN paymongo_refund_observation o ON o.intent_id=i.id AND o.status='succeeded'
  WHERE c.id=NEW.command_id AND c.action='PROVIDER_CONFIRMED' AND i.refund_id=NEW.refund_id AND i.request_id=NEW.request_id AND l.provider_id=NEW.reference
   AND (o.body->>'paymentId')=i.payment_id AND (o.body->>'amountCentavos')::bigint=i.amount_centavos AND (i.mode='test')=(NEW.environment='DEMO')
 )) THEN RAISE EXCEPTION 'Provider refund posting requires its exact verified successful resource'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER provider_refund_attempt_guard BEFORE INSERT ON booking_refund_attempt FOR EACH ROW EXECUTE FUNCTION provider_refund_attempt_guard();
CREATE FUNCTION protect_refund_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.intent_id IS DISTINCT FROM OLD.intent_id OR(OLD.first_dispatch_at IS NOT NULL AND NEW.first_dispatch_at IS DISTINCT FROM OLD.first_dispatch_at) THEN RAISE EXCEPTION 'Refund dispatch identity and original creation window are immutable'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER protect_refund_dispatch BEFORE UPDATE ON paymongo_refund_state FOR EACH ROW EXECUTE FUNCTION protect_refund_dispatch();
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['paymongo_refund_intent','paymongo_refund_link','paymongo_refund_observation','paymongo_refund_posting'] LOOP
  EXECUTE format('CREATE TRIGGER immutable_%I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION app_immutable()',name,name);
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN
  GRANT SELECT,INSERT ON paymongo_refund_intent,paymongo_refund_link,paymongo_refund_observation,paymongo_refund_posting TO rent2go_app;
  GRANT SELECT,INSERT,UPDATE ON paymongo_refund_state TO rent2go_app;
 END IF;
END $$;
