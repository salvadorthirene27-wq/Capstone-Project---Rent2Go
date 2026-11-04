CREATE TABLE booking_cart (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL UNIQUE REFERENCES app_actor(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE cart_item (
  id uuid PRIMARY KEY,
  cart_id uuid NOT NULL REFERENCES booking_cart(id),
  kind text NOT NULL CHECK (kind IN ('RENTAL','TOUR')),
  selection jsonb NOT NULL CHECK (jsonb_typeof(selection)='object'),
  saved_quote jsonb NOT NULL CHECK (jsonb_typeof(saved_quote)='object'),
  fingerprint text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);
CREATE UNIQUE INDEX one_active_cart_selection ON cart_item(cart_id,fingerprint) WHERE removed_at IS NULL;
CREATE INDEX active_cart_items ON cart_item(cart_id,created_at,id) WHERE removed_at IS NULL;
