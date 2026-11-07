-- SQL CHECK accepts UNKNOWN. Explicit non-null metadata prevents a partial
-- private-file identity from bypassing the original optional-file constraint.
ALTER TABLE platform_remittance_attempt ADD CONSTRAINT platform_attempt_evidence_complete CHECK (
 (file_id IS NULL AND mime IS NULL AND size_bytes IS NULL AND sha256 IS NULL AND backend IS NULL)
 OR
 (file_id IS NOT NULL AND mime IS NOT NULL AND mime IN('image/png','image/jpeg','application/pdf')
  AND size_bytes IS NOT NULL AND size_bytes BETWEEN 1 AND 5242880
  AND sha256 IS NOT NULL AND sha256 ~ '^[a-f0-9]{64}$'
  AND backend IS NOT NULL AND backend IN('s3','local'))
);
