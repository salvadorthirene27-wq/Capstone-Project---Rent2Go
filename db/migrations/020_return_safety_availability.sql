-- A physical return does not make a documented unsafe vehicle roadworthy.
CREATE FUNCTION booking_return_safety_hold(target_quote uuid,target_line uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM booking_inspection bad WHERE bad.quote_id=target_quote AND bad.line_id=target_line AND bad.phase='POST' AND (NOT (bad.body->>'roadworthy')::boolean OR NOT (bad.body->>'safetyChecked')::boolean)
 AND NOT EXISTS(SELECT 1 FROM booking_inspection fixed JOIN booking_inspection_ack accepted ON accepted.inspection_id=fixed.id AND accepted.decision='ACCEPT' WHERE fixed.quote_id=bad.quote_id AND fixed.line_id=bad.line_id AND fixed.phase='POST' AND fixed.revision>bad.revision AND (fixed.body->>'roadworthy')::boolean AND (fixed.body->>'safetyChecked')::boolean))
$$;
CREATE OR REPLACE FUNCTION booking_actual_resource_conflict(target uuid,start_time timestamptz,end_time timestamptz) RETURNS boolean LANGUAGE sql VOLATILE AS $$
 SELECT EXISTS(SELECT 1 FROM booking_actual_occupation a JOIN resource r ON r.id=a.resource_id WHERE a.resource_id=target AND (
 (a.closed_at IS NULL AND (a.planned_end<=clock_timestamp() OR tstzrange(a.opened_at,a.planned_end,'[)') && tstzrange(start_time,end_time,'[)')))
 OR (a.closed_at IS NOT NULL AND (tstzrange(a.opened_at,a.available_at,'[)') && tstzrange(start_time,end_time,'[)') OR (r.kind='VEHICLE' AND booking_return_safety_hold(a.quote_id,a.line_id))))))
$$;
