CREATE TABLE account_preferences (
  actor_id text PRIMARY KEY REFERENCES app_actor(id),
  phone text NOT NULL DEFAULT '' CHECK (length(phone) <= 30),
  emergency_contact text NOT NULL DEFAULT '' CHECK (length(emergency_contact) <= 120),
  address text NOT NULL DEFAULT '' CHECK (length(address) <= 400),
  payment_preference text CHECK (payment_preference IN ('PAYMONGO','AGENCY'))
);
