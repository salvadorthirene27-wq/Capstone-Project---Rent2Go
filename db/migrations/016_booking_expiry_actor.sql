-- Reserved non-authenticatable principal for automatic hold expiry audit records.
INSERT INTO app_actor(id,email,name,role,suspended,is_test_fixture)
VALUES('system:booking-hold-expiry','booking-hold-expiry@system.invalid','Automatic booking hold expiry','RENTER',true,true);
CREATE TRIGGER immutable_booking_expiry_actor BEFORE UPDATE OR DELETE ON app_actor
FOR EACH ROW WHEN (OLD.id='system:booking-hold-expiry') EXECUTE FUNCTION app_immutable();
