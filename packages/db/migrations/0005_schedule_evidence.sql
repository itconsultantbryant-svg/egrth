-- A schedule definition is immutable. Only its open-ended effective range may be closed once,
-- and only by appending a later definition. This does not grant a general evidence-edit path.
CREATE FUNCTION protect_schedule_definition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.schedule_id,NEW.version,NEW.weekdays,NEW.timezone,NEW.window_start_local,NEW.window_end_local,
         NEW.effective_from,NEW.created_by,NEW.reason,NEW.created_at)
     IS DISTINCT FROM
     ROW(OLD.schedule_id,OLD.version,OLD.weekdays,OLD.timezone,OLD.window_start_local,OLD.window_end_local,
         OLD.effective_from,OLD.created_by,OLD.reason,OLD.created_at) THEN
    RAISE EXCEPTION 'Schedule definitions are immutable; append a version';
  END IF;
  IF OLD.effective_until IS NOT NULL OR NEW.effective_until IS NULL OR NEW.effective_until<OLD.effective_from THEN
    RAISE EXCEPTION 'An open schedule definition may be closed once with a valid end date';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER schedule_definition_immutable BEFORE UPDATE ON schedule_versions
FOR EACH ROW EXECUTE FUNCTION protect_schedule_definition();
