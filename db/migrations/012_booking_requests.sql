CREATE TABLE booking_request (
  id uuid PRIMARY KEY,
  agency_id uuid NOT NULL REFERENCES agency(id),
  renter_id text NOT NULL REFERENCES app_actor(id),
  agency_name text NOT NULL,
  status text NOT NULL DEFAULT 'REQUIREMENTS_PENDING' CHECK(status='REQUIREMENTS_PENDING'),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  contact jsonb NOT NULL CHECK(jsonb_typeof(contact)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,agency_id)
);
CREATE INDEX renter_requests ON booking_request(renter_id,created_at DESC,id);
CREATE INDEX agency_requests ON booking_request(agency_id,created_at DESC,id);
CREATE TABLE booking_request_line (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL,
  agency_id uuid NOT NULL,
  cart_item_id uuid NOT NULL UNIQUE REFERENCES cart_item(id),
  public_quote jsonb NOT NULL CHECK(jsonb_typeof(public_quote)='object'),
  service_snapshot jsonb NOT NULL CHECK(jsonb_typeof(service_snapshot)='object'),
  policy_snapshot jsonb NOT NULL CHECK(jsonb_typeof(policy_snapshot)='object'),
  private_financial_snapshot jsonb NOT NULL CHECK(jsonb_typeof(private_financial_snapshot)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(request_id,agency_id) REFERENCES booking_request(id,agency_id)
);
CREATE TABLE booking_event (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES booking_request(id),
  actor_id text NOT NULL REFERENCES app_actor(id),
  action text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE booking_checkout_command (
  actor_id text NOT NULL REFERENCES app_actor(id),
  idempotency_key uuid NOT NULL,
  command_hash text NOT NULL,
  result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_id,idempotency_key)
);
CREATE TABLE booking_notification (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES booking_request(id),
  recipient_id text NOT NULL REFERENCES app_actor(id),
  message text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_notification_owner ON booking_notification(recipient_id,created_at DESC,id);
CREATE TRIGGER immutable_request_line BEFORE UPDATE OR DELETE ON booking_request_line FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_booking_event BEFORE UPDATE OR DELETE ON booking_event FOR EACH ROW EXECUTE FUNCTION app_immutable();
CREATE TRIGGER immutable_checkout_command BEFORE UPDATE OR DELETE ON booking_checkout_command FOR EACH ROW EXECUTE FUNCTION app_immutable();
