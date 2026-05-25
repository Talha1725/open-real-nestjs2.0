-- =============================================================================
-- Row-Level Security (RLS) Policies for Tenant Isolation
-- =============================================================================
--
-- P0-001 status: policies deployed, enforcement deferred.
--
-- The application layer (Prisma $extends) is the primary tenant isolation
-- mechanism for request handling. These RLS policies are defense-in-depth for
-- explicit transaction flows that set app.current_tenant_id before issuing
-- tenant-scoped queries.
--
-- How it works:
--   1. Application sets: SET LOCAL app.current_tenant_id = '<uuid>'
--      (within a transaction via PrismaService.setRlsContext())
--   2. The current_tenant_id() function reads this session variable
--   3. RLS policies filter rows: only rows matching the tenant are visible
--   4. When NO context is set (NULL), all rows are visible — this allows
--      migrations, seeding, and super admin operations to work normally
--
-- Do not treat this as request-wide RLS enforcement until every tenant request
-- runs all DB work inside a single transaction/connection with SET LOCAL applied.
--
-- IMPORTANT: RLS is only enforced for non-superuser roles. In dev with the
-- default 'postgres' superuser, policies are created but NOT enforced.
--
-- Production setup (run as superuser):
--   CREATE ROLE openreal_app LOGIN PASSWORD 'xxx' NOBYPASSRLS;
--   GRANT ALL ON ALL TABLES IN SCHEMA public TO openreal_app;
--   GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO openreal_app;
--   GRANT EXECUTE ON FUNCTION current_tenant_id() TO openreal_app;
--
-- To enforce RLS even for table owners in production, uncomment the
-- FORCE ROW LEVEL SECURITY lines at the bottom of this script.
-- =============================================================================

-- Helper function: read current tenant from session variable.
-- Returns TEXT (not UUID) because Prisma maps String @id to text columns.
DROP FUNCTION IF EXISTS current_tenant_id() CASCADE;
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS TEXT AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_tenant_id', true), '');
EXCEPTION
  WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- Enable RLS and create policies on all tenant-scoped tables
-- =============================================================================
-- Excluded tables:
--   tenants        — root entity, not scoped to itself
--   audit_log_events — tenantId is nullable, super admins need cross-tenant access
-- =============================================================================

-- Helper: drop existing policy if it exists, then create fresh
-- (makes this script idempotent)

-- users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON users;
CREATE POLICY tenant_isolation_policy ON users
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());

-- tenant_configs
ALTER TABLE tenant_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON tenant_configs;
CREATE POLICY tenant_isolation_policy ON tenant_configs
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());

-- verifications
ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON verifications;
CREATE POLICY tenant_isolation_policy ON verifications
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());

-- issuer_orgs
ALTER TABLE issuer_orgs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON issuer_orgs;
CREATE POLICY tenant_isolation_policy ON issuer_orgs
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());

-- kyb_applications
ALTER TABLE kyb_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON kyb_applications;
CREATE POLICY tenant_isolation_policy ON kyb_applications
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());

-- opportunities
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON opportunities;
CREATE POLICY tenant_isolation_policy ON opportunities
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());

-- opportunity_documents
ALTER TABLE opportunity_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON opportunity_documents;
CREATE POLICY tenant_isolation_policy ON opportunity_documents
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());

-- investment_requests
ALTER TABLE investment_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON investment_requests;
CREATE POLICY tenant_isolation_policy ON investment_requests
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());

-- payment_instructions
ALTER TABLE payment_instructions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON payment_instructions;
CREATE POLICY tenant_isolation_policy ON payment_instructions
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());

-- holdings
ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON holdings;
CREATE POLICY tenant_isolation_policy ON holdings
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());

-- distributions
ALTER TABLE distributions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON distributions;
CREATE POLICY tenant_isolation_policy ON distributions
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());

-- statements
ALTER TABLE statements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON statements;
CREATE POLICY tenant_isolation_policy ON statements
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());

-- content_articles
ALTER TABLE content_articles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON content_articles;
CREATE POLICY tenant_isolation_policy ON content_articles
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());

-- support_tickets
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON support_tickets;
CREATE POLICY tenant_isolation_policy ON support_tickets
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());

-- bank_details
ALTER TABLE bank_details ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON bank_details;
CREATE POLICY tenant_isolation_policy ON bank_details
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());

-- notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON notifications;
CREATE POLICY tenant_isolation_policy ON notifications
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());

-- transfer_cases
ALTER TABLE transfer_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON transfer_cases;
CREATE POLICY tenant_isolation_policy ON transfer_cases
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());

-- transfer_invitations
ALTER TABLE transfer_invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON transfer_invitations;
CREATE POLICY tenant_isolation_policy ON transfer_invitations
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());

-- transfer_checklist_items
ALTER TABLE transfer_checklist_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON transfer_checklist_items;
CREATE POLICY tenant_isolation_policy ON transfer_checklist_items
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());

-- priority_notices
ALTER TABLE priority_notices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON priority_notices;
CREATE POLICY tenant_isolation_policy ON priority_notices
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());

-- registry_entries
ALTER TABLE registry_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON registry_entries;
CREATE POLICY tenant_isolation_policy ON registry_entries
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());

-- token_records
ALTER TABLE token_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON token_records;
CREATE POLICY tenant_isolation_policy ON token_records
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());

-- orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON orders;
CREATE POLICY tenant_isolation_policy ON orders
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());

-- trades
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON trades;
CREATE POLICY tenant_isolation_policy ON trades
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());

-- settlement_records
ALTER TABLE settlement_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON settlement_records;
CREATE POLICY tenant_isolation_policy ON settlement_records
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());

-- liquidity_configs
ALTER TABLE liquidity_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON liquidity_configs;
CREATE POLICY tenant_isolation_policy ON liquidity_configs
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());

-- =============================================================================
-- Production: Uncomment these to enforce RLS even for table owners.
-- This prevents the application DB user from bypassing RLS even if it owns
-- the tables (e.g. if it ran the migrations).
-- =============================================================================
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_configs FORCE ROW LEVEL SECURITY;
ALTER TABLE verifications FORCE ROW LEVEL SECURITY;
ALTER TABLE issuer_orgs FORCE ROW LEVEL SECURITY;
ALTER TABLE kyb_applications FORCE ROW LEVEL SECURITY;
ALTER TABLE opportunities FORCE ROW LEVEL SECURITY;
ALTER TABLE opportunity_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE investment_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE payment_instructions FORCE ROW LEVEL SECURITY;
ALTER TABLE holdings FORCE ROW LEVEL SECURITY;
ALTER TABLE distributions FORCE ROW LEVEL SECURITY;
ALTER TABLE statements FORCE ROW LEVEL SECURITY;
ALTER TABLE content_articles FORCE ROW LEVEL SECURITY;
ALTER TABLE support_tickets FORCE ROW LEVEL SECURITY;
ALTER TABLE bank_details FORCE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE transfer_cases FORCE ROW LEVEL SECURITY;
ALTER TABLE transfer_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE transfer_checklist_items FORCE ROW LEVEL SECURITY;
ALTER TABLE priority_notices FORCE ROW LEVEL SECURITY;
ALTER TABLE registry_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE token_records FORCE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
ALTER TABLE trades FORCE ROW LEVEL SECURITY;
ALTER TABLE settlement_records FORCE ROW LEVEL SECURITY;
ALTER TABLE liquidity_configs FORCE ROW LEVEL SECURITY;
