-- Upgrades must work for existing restricted runtime installs without rerunning setup.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rent2go_app') THEN
    GRANT SELECT,INSERT,UPDATE ON booking_cart,cart_item,booking_request,booking_notification TO rent2go_app;
    GRANT SELECT,INSERT ON booking_request_line,booking_event,booking_checkout_command TO rent2go_app;
  END IF;
END $$;
