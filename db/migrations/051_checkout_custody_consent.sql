CREATE TABLE paymongo_checkout_consent (
 checkout_id uuid PRIMARY KEY REFERENCES paymongo_checkout(id),actor_id text NOT NULL REFERENCES app_actor(id),
 revision text NOT NULL CHECK(length(revision) BETWEEN 1 AND 80),digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),accepted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION checkout_consent_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM paymongo_checkout x WHERE x.id=NEW.checkout_id AND x.renter_id=NEW.actor_id) THEN RAISE EXCEPTION 'Checkout consent must belong to the original renter'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER checkout_consent_identity BEFORE INSERT ON paymongo_checkout_consent FOR EACH ROW EXECUTE FUNCTION checkout_consent_identity();
CREATE TRIGGER immutable_checkout_consent BEFORE UPDATE OR DELETE ON paymongo_checkout_consent FOR EACH ROW EXECUTE FUNCTION app_immutable();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN GRANT SELECT,INSERT ON paymongo_checkout_consent TO rent2go_app; END IF; END $$;
