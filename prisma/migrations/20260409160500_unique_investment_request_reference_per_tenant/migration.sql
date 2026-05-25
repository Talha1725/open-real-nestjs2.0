-- Enforce uniqueness of investment request reference numbers per tenant.
-- This prevents race-condition duplicates and enables safe retry-on-conflict.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname = 'investment_requests_tenant_reference_unique'
  ) THEN
    ALTER TABLE "investment_requests"
      ADD CONSTRAINT "investment_requests_tenant_reference_unique"
      UNIQUE ("tenant_id", "reference_number");
  END IF;
END $$;

