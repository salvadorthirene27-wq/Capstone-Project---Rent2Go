CREATE OR REPLACE FUNCTION validate_ocr_consent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM booking_requirement_file f JOIN booking_request r ON r.id=f.request_id JOIN booking_ocr_command c ON c.id=NEW.command_id AND c.file_id=f.id AND c.actor_id=NEW.actor_id AND c.action=CASE NEW.decision WHEN 'ALLOW' THEN 'EXTRACT' ELSE 'REVOKE' END WHERE f.id=NEW.file_id AND f.uploader_id=NEW.actor_id AND r.renter_id=NEW.actor_id AND f.sha256=NEW.file_sha256) THEN RAISE EXCEPTION 'OCR consent must match the exact uploader, command and document'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION validate_new_ocr_job() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.dispatch_at IS NOT NULL OR NEW.ended_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM booking_requirement_file f JOIN booking_ocr_consent s ON s.id=NEW.consent_id AND s.file_id=f.id AND s.decision='ALLOW' AND s.file_sha256=f.sha256 JOIN booking_ocr_command c ON c.id=NEW.command_id AND c.file_id=f.id AND c.actor_id=NEW.actor_id AND c.action='EXTRACT' WHERE f.id=NEW.file_id AND f.sha256=NEW.file_sha256) THEN RAISE EXCEPTION 'New OCR jobs must preserve exact allowed document and undispatched command'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_new_ocr_job BEFORE INSERT ON booking_ocr_job FOR EACH ROW EXECUTE FUNCTION validate_new_ocr_job();
CREATE FUNCTION validate_ocr_result() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM booking_ocr_job WHERE id=NEW.job_id AND ended_at IS NULL AND (NEW.outcome NOT IN ('SUCCEEDED','PARTIAL') OR (dispatch_at IS NOT NULL AND NEW.page_count>0 AND length(trim(NEW.text_content))>0 AND NEW.provider_code IN (1,2)))) THEN RAISE EXCEPTION 'OCR result must match an unfinished job and actual dispatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_ocr_result BEFORE INSERT ON booking_ocr_result FOR EACH ROW EXECUTE FUNCTION validate_ocr_result();
CREATE FUNCTION validate_ocr_comparison() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM booking_ocr_result r JOIN booking_ocr_job j ON j.id=r.job_id JOIN booking_ocr_command c ON c.id=NEW.command_id AND c.file_id=j.file_id AND c.actor_id=NEW.actor_id AND c.action='COMPARE' WHERE r.job_id=NEW.job_id AND r.digest=NEW.result_digest AND r.outcome IN ('SUCCEEDED','PARTIAL')) OR (NEW.decision='UNUSABLE' AND length(trim(NEW.note))<5) THEN RAISE EXCEPTION 'OCR comparison must identify the exact saved result and comparison command'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_ocr_comparison BEFORE INSERT ON booking_ocr_review FOR EACH ROW EXECUTE FUNCTION validate_ocr_comparison();
