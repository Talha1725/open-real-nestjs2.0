-- Create trigger function to prevent updates or deletes on audit_log_events
CREATE OR REPLACE FUNCTION make_audit_log_immutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_log_events is immutable and cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to audit_log_events
CREATE TRIGGER trigger_audit_log_immutable
BEFORE UPDATE OR DELETE ON "audit_log_events"
FOR EACH ROW
EXECUTE FUNCTION make_audit_log_immutable();
