CREATE FUNCTION "reject_incident_event_changes"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'incident_events is append-only: % is not allowed', TG_OP;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "incident_events_append_only"
BEFORE UPDATE OR DELETE ON "incident_events"
FOR EACH ROW EXECUTE FUNCTION "reject_incident_event_changes"();
