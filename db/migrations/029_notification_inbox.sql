CREATE TABLE vehicle_notification (
 id uuid PRIMARY KEY,recipient_id text NOT NULL REFERENCES app_actor(id),offer_id uuid NOT NULL REFERENCES vehicle_offer(id),event_kind text NOT NULL CHECK(event_kind IN ('VEHICLE_STATUS','OWNER_ALLOCATION_REVIEW')),event_id uuid NOT NULL,message text NOT NULL CHECK(length(message) BETWEEN 1 AND 1000),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(event_kind,event_id,recipient_id)
);
CREATE INDEX vehicle_notification_recipient ON vehicle_notification(recipient_id,created_at DESC,id DESC);
CREATE TRIGGER immutable_vehicle_notification BEFORE UPDATE OR DELETE ON vehicle_notification FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TABLE notification_read_receipt (
 source text NOT NULL CHECK(source IN ('PARTNER','BOOKING','FINANCE','VEHICLE')),notification_id uuid NOT NULL,recipient_id text NOT NULL REFERENCES app_actor(id),read_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(source,notification_id)
);
CREATE INDEX notification_read_recipient ON notification_read_receipt(recipient_id,source,notification_id);
CREATE FUNCTION notification_receipt_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original_recipient text;
BEGIN
 CASE NEW.source
 WHEN 'PARTNER' THEN SELECT recipient_id INTO original_recipient FROM app_notification WHERE id=NEW.notification_id;
 WHEN 'BOOKING' THEN SELECT recipient_id INTO original_recipient FROM booking_notification WHERE id=NEW.notification_id;
 WHEN 'FINANCE' THEN SELECT recipient_id INTO original_recipient FROM finance_notification WHERE id=NEW.notification_id;
 WHEN 'VEHICLE' THEN SELECT recipient_id INTO original_recipient FROM vehicle_notification WHERE id=NEW.notification_id;
 ELSE RAISE EXCEPTION 'Unknown notification source';
 END CASE;
 IF original_recipient IS DISTINCT FROM NEW.recipient_id THEN RAISE EXCEPTION 'Read receipt must belong to the delivered recipient'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_notification_receipt BEFORE INSERT ON notification_read_receipt FOR EACH ROW EXECUTE FUNCTION notification_receipt_identity();
CREATE TRIGGER immutable_notification_receipt BEFORE UPDATE OR DELETE ON notification_read_receipt FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE FUNCTION protect_delivered_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'read_at')<>(to_jsonb(OLD)-'read_at') OR (OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at) THEN RAISE EXCEPTION 'Delivered notification content and prior read time are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_app_notification BEFORE UPDATE OR DELETE ON app_notification FOR EACH ROW EXECUTE FUNCTION protect_delivered_notification();
CREATE TRIGGER protect_booking_notification BEFORE UPDATE OR DELETE ON booking_notification FOR EACH ROW EXECUTE FUNCTION protect_delivered_notification();
CREATE TRIGGER protect_finance_notification BEFORE UPDATE OR DELETE ON finance_notification FOR EACH ROW EXECUTE FUNCTION protect_delivered_notification();

-- Delivery is part of the same transaction as the saved vehicle transition.
-- No historical delivery is invented: only events recorded after installation emit here.
CREATE FUNCTION deliver_vehicle_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO vehicle_notification(id,recipient_id,offer_id,event_kind,event_id,message)
 SELECT gen_random_uuid(),u.id,o.id,'VEHICLE_STATUS',NEW.id,'Vehicle partnership activity was recorded. Open the saved vehicle workspace to review the current status and permitted details.'
 FROM vehicle_offer o JOIN physical_vehicle v ON v.id=o.vehicle_id JOIN agency g ON g.id=o.agency_id JOIN app_actor owner ON owner.id=g.owner_id CROSS JOIN app_actor u
 WHERE o.id=NEW.offer_id AND NOT u.suspended AND NOT u.is_test_fixture AND
 (u.id=v.owner_actor_id OR (NEW.next_state<>'DRAFT' AND g.active AND NOT owner.suspended AND NOT owner.is_test_fixture AND (u.id=g.owner_id OR EXISTS(SELECT 1 FROM agency_member m WHERE m.agency_id=g.id AND m.actor_id=u.id AND m.active))) OR
 (NEW.next_state='COMPLIANCE_REVIEW' AND u.role='SUPER_ADMIN' AND u.id IS DISTINCT FROM v.owner_actor_id AND u.id<>g.owner_id AND NOT EXISTS(SELECT 1 FROM agency_member m WHERE m.agency_id=g.id AND m.actor_id=u.id AND m.active)))
 ON CONFLICT(event_kind,event_id,recipient_id) DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER notify_saved_vehicle_event AFTER INSERT ON vehicle_event FOR EACH ROW EXECUTE FUNCTION deliver_vehicle_update();
CREATE FUNCTION deliver_owner_allocation_review() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.decision='ACCEPT' THEN
  INSERT INTO vehicle_notification(id,recipient_id,offer_id,event_kind,event_id,message)
  SELECT DISTINCT gen_random_uuid(),u.id,o.id,'OWNER_ALLOCATION_REVIEW',NEW.id,'A renter-accepted assessment affects your consigned vehicle. Review the exact owner allocation in your vehicle workspace; acceptance is separate from payment and earnings.'
  FROM booking_assessment a JOIN booking_quotation_line q ON q.quote_id=a.quote_id JOIN booking_request_line l ON l.id=q.line_id AND l.request_id=q.request_id
  JOIN vehicle_offer o ON o.id::text=l.public_quote->'selection'->>'offerId' JOIN physical_vehicle v ON v.id=o.vehicle_id
  JOIN app_actor u ON u.id=q.private_financial_snapshot->>'cosignerId'
  WHERE a.id=NEW.assessment_id AND q.private_financial_snapshot->>'category'='CONSIGNED' AND v.owner_actor_id=u.id AND v.id::text=q.private_financial_snapshot->>'vehicleId' AND NOT u.suspended AND NOT u.is_test_fixture
  AND EXISTS(SELECT 1 FROM jsonb_array_elements((a.body->'proposal'->'charges')||(a.body->'proposal'->'credits')) item WHERE item->>'lineId'=q.line_id::text)
  ON CONFLICT(event_kind,event_id,recipient_id) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER notify_owner_allocation_review AFTER INSERT ON booking_assessment_decision FOR EACH ROW EXECUTE FUNCTION deliver_owner_allocation_review();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN GRANT SELECT,INSERT ON vehicle_notification,notification_read_receipt TO rent2go_app; END IF; END $$;
