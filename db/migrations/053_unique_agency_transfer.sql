-- A booking can have only one original agency transfer, across all request revisions.
ALTER TABLE central_disbursement_transfer ADD CONSTRAINT central_disbursement_transfer_request_unique UNIQUE(request_id);
