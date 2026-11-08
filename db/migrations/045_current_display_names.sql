-- Current presentation metadata only. Independent of gateway migrations042–044.
-- Accepted submissions, signatures, quotations and financial snapshots retain
-- their saved identities. These fields never decide prices, shares or access.
ALTER TABLE agency ADD COLUMN display_name text CHECK(display_name IS NULL OR length(trim(display_name)) BETWEEN 1 AND 160);
ALTER TABLE vehicle_offer ADD COLUMN display_make text CHECK(display_make IS NULL OR length(trim(display_make)) BETWEEN 1 AND 80);
ALTER TABLE vehicle_offer ADD COLUMN display_model text CHECK(display_model IS NULL OR length(trim(display_model)) BETWEEN 1 AND 120);
ALTER TABLE tour_package ADD COLUMN display_title text CHECK(display_title IS NULL OR length(trim(display_title)) BETWEEN 1 AND 160);
