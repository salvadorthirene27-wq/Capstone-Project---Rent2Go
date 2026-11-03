ALTER TABLE private_file ADD COLUMN is_current boolean NOT NULL DEFAULT true;
ALTER TABLE private_file ADD COLUMN storage_driver text NOT NULL DEFAULT 's3' CHECK(storage_driver IN ('s3','local'));
WITH ranked AS (SELECT id,row_number() OVER(PARTITION BY application_id,purpose ORDER BY created_at DESC,id DESC) n FROM private_file)
UPDATE private_file SET is_current=false WHERE id IN (SELECT id FROM ranked WHERE n>1);
CREATE UNIQUE INDEX one_current_evidence ON private_file(application_id,purpose) WHERE is_current;
