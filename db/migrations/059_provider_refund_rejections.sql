CREATE TABLE paymongo_refund_rejection(intent_id uuid PRIMARY KEY REFERENCES paymongo_refund_intent(id),provider_status integer NOT NULL CHECK(provider_status=400),code text NOT NULL CHECK(code='available_balance_insufficient'),recorded_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE FUNCTION refund_rejection_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM paymongo_refund_link WHERE intent_id=NEW.intent_id) THEN RAISE EXCEPTION 'A mapped provider refund cannot be declared uncreated';END IF;RETURN NEW;END $$;
CREATE TRIGGER refund_rejection_guard BEFORE INSERT ON paymongo_refund_rejection FOR EACH ROW EXECUTE FUNCTION refund_rejection_guard();
CREATE TRIGGER immutable_paymongo_refund_rejection BEFORE UPDATE OR DELETE ON paymongo_refund_rejection FOR EACH ROW EXECUTE FUNCTION app_immutable();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN GRANT SELECT,INSERT ON paymongo_refund_rejection TO rent2go_app;END IF;END $$;
