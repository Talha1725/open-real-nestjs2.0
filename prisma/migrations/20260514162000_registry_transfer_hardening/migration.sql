-- Per-lot lockup support. Existing holdings inherit the opportunity lockup
-- so current transfer behaviour is preserved after the schema change.
ALTER TABLE "holdings"
  ADD COLUMN IF NOT EXISTS "lockup_until" TIMESTAMP(3);

UPDATE "holdings" h
SET "lockup_until" = o."lockup_until"
FROM "opportunities" o
WHERE h."opportunity_id" = o."id"
  AND h."lockup_until" IS NULL
  AND o."lockup_until" IS NOT NULL;

-- Secondary-transfer holdings are not backed by a primary investment request.
ALTER TABLE "holdings"
  ALTER COLUMN "investment_request_id" DROP NOT NULL;

-- Audit log append-only defense in depth.
CREATE OR REPLACE FUNCTION audit_log_events_immutable()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log_events is append-only; UPDATE/DELETE is not allowed';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_events_immutable ON "audit_log_events";
CREATE TRIGGER audit_log_events_immutable
  BEFORE UPDATE OR DELETE ON "audit_log_events"
  FOR EACH ROW EXECUTE FUNCTION audit_log_events_immutable();
