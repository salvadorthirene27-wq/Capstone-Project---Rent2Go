-- Read-only server policy lookup. It grants no direct access to managed accounts,
-- session tokens, password writes or verification codes.
CREATE FUNCTION rent2go_current_credential_digest(account_email text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE digest text; matches bigint;
BEGIN
 IF to_regclass('neon_auth.account') IS NULL OR to_regclass('neon_auth.user') IS NULL THEN
  RAISE EXCEPTION 'Managed credential policy is unavailable' USING ERRCODE='55000';
 END IF;
 SELECT max(a.password),count(*) INTO digest,matches
 FROM neon_auth.account a JOIN neon_auth."user" u ON u.id=a."userId"
 WHERE lower(u.email)=lower(account_email) AND a."providerId"='credential';
 IF matches>1 THEN RAISE EXCEPTION 'Managed credential policy is ambiguous' USING ERRCODE='55000'; END IF;
 RETURN digest;
END $$;
REVOKE ALL ON FUNCTION rent2go_current_credential_digest(text) FROM PUBLIC;
