-- Provider evidence is distinct from an agency's receipt. Historical manual and
-- simulated collections retain their original channels and custodians.
INSERT INTO app_actor(id,email,name,role,suspended,is_test_fixture)
VALUES('system:paymongo-booking','paymongo-booking@system.invalid','PayMongo booking reconciliation','RENTER',true,true);
CREATE TRIGGER immutable_paymongo_booking_actor BEFORE UPDATE OR DELETE ON app_actor
FOR EACH ROW WHEN (OLD.id='system:paymongo-booking') EXECUTE FUNCTION app_immutable();

ALTER TABLE booking_payment_command DROP CONSTRAINT booking_payment_command_action_check;
ALTER TABLE booking_payment_command ADD CONSTRAINT booking_payment_command_action_check CHECK(action IN ('SUBMIT_GCASH','RECORD_CASH','REVIEW_GCASH','SIMULATE_PAYMENT','RESOLVE_DEMO','PROVIDER_CONFIRMED'));
ALTER TABLE booking_payment_attempt DROP CONSTRAINT booking_payment_attempt_method_check;
ALTER TABLE booking_payment_attempt ADD CONSTRAINT booking_payment_attempt_method_check CHECK(method IN ('CASH','GCASH','DEMO_CARD','DEMO_GCASH','DEMO_PAYPAL','PAYMONGO'));
ALTER TABLE booking_payment_collection DROP CONSTRAINT booking_payment_collection_method_check;
ALTER TABLE booking_payment_collection ADD CONSTRAINT booking_payment_collection_method_check CHECK(method IN ('CASH','GCASH','DEMO_CARD','DEMO_GCASH','DEMO_PAYPAL','PAYMONGO'));
ALTER TABLE booking_payment_collection DROP CONSTRAINT booking_payment_collection_check;
ALTER TABLE booking_payment_collection ADD CONSTRAINT booking_payment_collection_check CHECK((environment='MANUAL' AND method IN ('CASH','GCASH','PAYMONGO')) OR (environment='DEMO' AND method IN ('DEMO_CARD','DEMO_GCASH','DEMO_PAYPAL','PAYMONGO')));

ALTER TABLE paymongo_checkout ADD UNIQUE(id,request_id,quote_id,agreement_id);
ALTER TABLE paymongo_checkout_payment ADD UNIQUE(id,checkout_id,amount_centavos);
ALTER TABLE booking_payment_collection ADD UNIQUE(id,request_id,quote_id,agreement_id,amount_centavos);
CREATE TABLE paymongo_booking_posting (
 checkout_id uuid PRIMARY KEY, payment_receipt_id uuid NOT NULL UNIQUE,
 request_id uuid NOT NULL, quote_id uuid NOT NULL, agreement_id uuid NOT NULL,
 amount_centavos bigint NOT NULL,
 outcome text NOT NULL CHECK(outcome IN ('COLLECTED','CLOSED_LIABILITY','CHANNEL_CONFLICT')),
 collection_id uuid UNIQUE, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(checkout_id,request_id,quote_id,agreement_id) REFERENCES paymongo_checkout(id,request_id,quote_id,agreement_id),
 FOREIGN KEY(payment_receipt_id,checkout_id,amount_centavos) REFERENCES paymongo_checkout_payment(id,checkout_id,amount_centavos),
 FOREIGN KEY(collection_id,request_id,quote_id,agreement_id,amount_centavos) REFERENCES booking_payment_collection(id,request_id,quote_id,agreement_id,amount_centavos),
 CHECK((outcome='COLLECTED')=(collection_id IS NOT NULL))
);
CREATE FUNCTION paymongo_posting_channel_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.collection_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM booking_payment_collection k JOIN paymongo_checkout x ON x.id=NEW.checkout_id
  WHERE k.id=NEW.collection_id AND k.method='PAYMONGO' AND k.recorded_by='system:paymongo-booking'
   AND k.environment=CASE WHEN x.mode='test' THEN 'DEMO' ELSE 'MANUAL' END
 ) THEN RAISE EXCEPTION 'Provider posting must retain its verified central channel and environment' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER paymongo_posting_channel_guard BEFORE INSERT ON paymongo_booking_posting FOR EACH ROW EXECUTE FUNCTION paymongo_posting_channel_guard();
CREATE TRIGGER immutable_paymongo_booking_posting BEFORE UPDATE OR DELETE ON paymongo_booking_posting FOR EACH ROW EXECUTE FUNCTION app_immutable();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN
 GRANT SELECT,INSERT ON paymongo_booking_posting TO rent2go_app;
END IF; END $$;
