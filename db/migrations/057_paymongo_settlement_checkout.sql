ALTER TABLE paymongo_checkout DROP CONSTRAINT paymongo_checkout_quote_id_key;
ALTER TABLE paymongo_checkout ADD COLUMN purpose text NOT NULL DEFAULT 'BOOKING' CHECK(purpose IN ('BOOKING','SETTLEMENT'));
CREATE UNIQUE INDEX paymongo_original_quote_unique ON paymongo_checkout(quote_id) WHERE purpose='BOOKING';
CREATE TABLE paymongo_settlement_checkout (
 checkout_id uuid PRIMARY KEY REFERENCES paymongo_checkout(id),settlement_id uuid NOT NULL REFERENCES booking_settlement(id),request_id uuid NOT NULL REFERENCES booking_request(id),settlement_digest text NOT NULL CHECK(settlement_digest ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_paymongo_settlement_checkout BEFORE UPDATE OR DELETE ON paymongo_settlement_checkout FOR EACH ROW EXECUTE FUNCTION app_immutable();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN GRANT SELECT,INSERT ON paymongo_settlement_checkout TO rent2go_app;END IF;END $$;
