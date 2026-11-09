-- Retain original agency request notes alongside its immutable destination.
ALTER TABLE central_disbursement ADD COLUMN request_reason text NOT NULL DEFAULT 'Original request recorded before request notes were retained' CHECK(length(trim(request_reason)) BETWEEN 1 AND 2000);
ALTER TABLE central_disbursement ALTER COLUMN request_reason DROP DEFAULT;
