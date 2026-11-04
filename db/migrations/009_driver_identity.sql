-- One physical driver must not become independently reservable via duplicate identities.
ALTER TABLE agency_driver ADD COLUMN license_normalized text GENERATED ALWAYS AS(upper(regexp_replace(license_number,'[^A-Za-z0-9]','','g'))) STORED;
ALTER TABLE agency_driver ADD CONSTRAINT valid_driver_identity CHECK(length(license_normalized)>=3);
ALTER TABLE agency_driver ADD CONSTRAINT one_physical_driver_identity UNIQUE(license_normalized);
