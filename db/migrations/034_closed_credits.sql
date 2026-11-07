-- Compensating records only. Original closes, allocations and paid payouts stay immutable.
CREATE TABLE booking_closed_credit_command (
 id uuid PRIMARY KEY,request_id uuid NOT NULL REFERENCES booking_request(id),actor_id text NOT NULL REFERENCES app_actor(id),idempotency_key uuid NOT NULL,digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(request_id,actor_id,idempotency_key)
);
CREATE TABLE booking_closed_credit (
 id uuid PRIMARY KEY,close_id uuid NOT NULL,request_id uuid NOT NULL,quote_id uuid NOT NULL,agency_id uuid NOT NULL,environment text NOT NULL,source_kind text NOT NULL CHECK(source_kind IN ('SERVICE','EXTRA')),source_id uuid NOT NULL,line_id uuid NOT NULL,actor_id text NOT NULL REFERENCES app_actor(id),owner_id text REFERENCES app_actor(id),amount_centavos bigint NOT NULL CHECK(amount_centavos BETWEEN 1 AND 9007199254740991),owner_centavos bigint NOT NULL CHECK(owner_centavos BETWEEN 0 AND amount_centavos),baseline_centavos bigint NOT NULL CHECK(baseline_centavos>=0),reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),body jsonb NOT NULL CHECK(jsonb_typeof(body)='object'),digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),owner_digest text NOT NULL CHECK(owner_digest ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(close_id,request_id,quote_id,agency_id,environment) REFERENCES booking_financial_close(id,request_id,quote_id,agency_id,environment),CHECK(owner_centavos=0 OR owner_id IS NOT NULL),UNIQUE(id,request_id),UNIQUE(id,request_id,environment)
);
CREATE INDEX closed_credit_request ON booking_closed_credit(request_id,created_at DESC,id);
CREATE INDEX closed_credit_owner ON booking_closed_credit(owner_id,created_at DESC,id);
CREATE TABLE booking_closed_credit_decision (
 id uuid PRIMARY KEY,credit_id uuid NOT NULL REFERENCES booking_closed_credit(id),party text NOT NULL CHECK(party IN ('RENTER','OWNER')),actor_id text NOT NULL REFERENCES app_actor(id),decision text NOT NULL CHECK(decision IN ('ACCEPT','DISPUTE')),digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),consent boolean NOT NULL,reason text NOT NULL CHECK(length(reason)<=2000 AND (decision='ACCEPT' OR length(trim(reason))>0)),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(credit_id,party),CHECK(decision<>'ACCEPT' OR consent)
);
CREATE TABLE booking_closed_credit_cancel (
 credit_id uuid PRIMARY KEY REFERENCES booking_closed_credit(id),actor_id text NOT NULL REFERENCES app_actor(id),reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE booking_closed_credit_post (
 credit_id uuid PRIMARY KEY REFERENCES booking_closed_credit(id),actor_id text NOT NULL REFERENCES app_actor(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE booking_revenue_credit (
 id uuid PRIMARY KEY,credit_id uuid NOT NULL REFERENCES booking_closed_credit_post(credit_id),entry_id uuid NOT NULL REFERENCES booking_revenue_entry(id),amount_centavos bigint NOT NULL CHECK(amount_centavos BETWEEN 0 AND 9007199254740991),UNIQUE(credit_id,entry_id)
);
CREATE INDEX revenue_credit_original ON booking_revenue_credit(entry_id);
CREATE TABLE booking_closed_refund_link (
 refund_id uuid PRIMARY KEY REFERENCES booking_refund_request(id),credit_id uuid NOT NULL REFERENCES booking_closed_credit_post(credit_id),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION assert_closed_credit_conservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE key uuid; doc booking_closed_credit%ROWTYPE; basis numeric; actual numeric; renter text;
BEGIN
 IF TG_TABLE_NAME='booking_closed_credit' THEN key:=NEW.id; ELSE key:=NEW.credit_id; END IF;
 SELECT * INTO STRICT doc FROM booking_closed_credit WHERE id=key;
 PERFORM id FROM booking_request WHERE id=doc.request_id FOR UPDATE;
 SELECT renter_id INTO renter FROM booking_request WHERE id=doc.request_id;
 SELECT sum(amount_centavos) INTO basis FROM booking_revenue_entry WHERE close_id=doc.close_id AND source_kind=doc.source_kind AND source_id=doc.source_id AND line_id=doc.line_id;
 IF basis IS NULL OR doc.amount_centavos+doc.baseline_centavos>basis THEN RAISE EXCEPTION 'Closed credit exceeds its original revenue source'; END IF;
 IF EXISTS(SELECT 1 FROM booking_closed_credit_decision d WHERE d.credit_id=key AND ((d.party='RENTER' AND (d.actor_id<>renter OR d.digest<>doc.digest)) OR (d.party='OWNER' AND (d.actor_id IS DISTINCT FROM doc.owner_id OR d.digest<>doc.owner_digest)))) THEN RAISE EXCEPTION 'Closed credit decision does not match its original party'; END IF;
 IF NOT EXISTS(SELECT 1 FROM booking_closed_credit_post WHERE credit_id=key) THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM booking_closed_credit_cancel WHERE credit_id=key) OR NOT EXISTS(SELECT 1 FROM booking_closed_credit_decision WHERE credit_id=key AND party='RENTER' AND decision='ACCEPT' AND consent) OR (doc.owner_centavos>0 AND NOT EXISTS(SELECT 1 FROM booking_closed_credit_decision WHERE credit_id=key AND party='OWNER' AND decision='ACCEPT' AND consent)) THEN RAISE EXCEPTION 'Closed credit requires exact renter and affected owner acceptance'; END IF;
 SELECT sum(amount_centavos) INTO actual FROM booking_revenue_credit WHERE credit_id=key;
 IF actual IS DISTINCT FROM doc.amount_centavos::numeric OR (SELECT count(*) FROM booking_revenue_credit WHERE credit_id=key)<>4 THEN RAISE EXCEPTION 'Closed credit does not conserve four original allocations'; END IF;
 IF EXISTS(SELECT 1 FROM booking_revenue_credit x JOIN booking_revenue_entry e ON e.id=x.entry_id WHERE x.credit_id=key AND (e.close_id<>doc.close_id OR e.source_kind<>doc.source_kind OR e.source_id<>doc.source_id OR e.line_id<>doc.line_id OR (e.recipient='COSIGNER' AND (e.beneficiary_actor_id IS DISTINCT FROM doc.owner_id OR x.amount_centavos<>doc.owner_centavos)))) THEN RAISE EXCEPTION 'Closed credit does not match its original source'; END IF;
 IF EXISTS(SELECT 1 FROM booking_revenue_entry e JOIN booking_revenue_credit x ON x.entry_id=e.id WHERE e.close_id=doc.close_id GROUP BY e.id,e.amount_centavos HAVING sum(x.amount_centavos)>e.amount_centavos) THEN RAISE EXCEPTION 'Closed credit over-reverses an original allocation'; END IF;
 RETURN NULL;
END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['booking_closed_credit','booking_closed_credit_decision','booking_closed_credit_cancel','booking_closed_credit_post','booking_revenue_credit'] LOOP
 EXECUTE format('CREATE CONSTRAINT TRIGGER conserve_%I AFTER INSERT ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_closed_credit_conservation()',t,t);
END LOOP; END $$;

CREATE FUNCTION assert_closed_refund_link() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE key uuid; doc booking_closed_credit%ROWTYPE; actual numeric;
BEGIN
 SELECT * INTO STRICT doc FROM booking_closed_credit WHERE id=NEW.credit_id;
 PERFORM id FROM booking_request WHERE id=doc.request_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM booking_refund_request r WHERE r.id=NEW.refund_id AND r.request_id=doc.request_id AND r.quote_id=doc.quote_id AND r.environment=doc.environment) THEN RAISE EXCEPTION 'Closed refund does not match its accepted credit'; END IF;
 SELECT COALESCE(sum(r.amount_centavos),0) INTO actual FROM booking_closed_refund_link l JOIN booking_refund_request r ON r.id=l.refund_id LEFT JOIN booking_refund_decision d ON d.refund_id=r.id WHERE l.credit_id=doc.id AND NOT EXISTS(SELECT 1 FROM booking_refund_cancel x WHERE x.refund_id=r.id) AND (d.decision IS NULL OR d.decision='APPROVE');
 IF actual>doc.amount_centavos THEN RAISE EXCEPTION 'Closed refund exceeds its accepted credit'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER conserve_closed_refund AFTER INSERT ON booking_closed_refund_link DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_closed_refund_link();
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['booking_closed_credit_command','booking_closed_credit','booking_closed_credit_decision','booking_closed_credit_cancel','booking_closed_credit_post','booking_revenue_credit','booking_closed_refund_link'] LOOP
 EXECUTE format('CREATE TRIGGER immutable_%I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION app_immutable()',t,t);
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN EXECUTE format('GRANT SELECT,INSERT ON %I TO rent2go_app',t); END IF;
END LOOP; END $$;
