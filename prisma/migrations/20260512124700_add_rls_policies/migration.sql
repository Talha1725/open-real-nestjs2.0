-- =============================================================================
-- Row-Level Security (RLS) Policies for Tenant Isolation
-- Defense-in-depth: applied on top of the application-layer (Prisma $extends).
-- =============================================================================

-- Helper function: read current tenant from session variable.
DROP FUNCTION IF EXISTS current_tenant_id() CASCADE;
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS TEXT AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_tenant_id', true), '');
EXCEPTION
  WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON users;
CREATE POLICY tenant_isolation_policy ON users
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());
ALTER TABLE users FORCE ROW LEVEL SECURITY;

-- tenant_configs
ALTER TABLE tenant_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON tenant_configs;
CREATE POLICY tenant_isolation_policy ON tenant_configs
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());
ALTER TABLE tenant_configs FORCE ROW LEVEL SECURITY;

-- verifications
ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON verifications;
CREATE POLICY tenant_isolation_policy ON verifications
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());
ALTER TABLE verifications FORCE ROW LEVEL SECURITY;

-- issuer_orgs
ALTER TABLE issuer_orgs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON issuer_orgs;
CREATE POLICY tenant_isolation_policy ON issuer_orgs
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());
ALTER TABLE issuer_orgs FORCE ROW LEVEL SECURITY;

-- kyb_applications
ALTER TABLE kyb_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON kyb_applications;
CREATE POLICY tenant_isolation_policy ON kyb_applications
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());
ALTER TABLE kyb_applications FORCE ROW LEVEL SECURITY;

-- opportunities
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON opportunities;
CREATE POLICY tenant_isolation_policy ON opportunities
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());
ALTER TABLE opportunities FORCE ROW LEVEL SECURITY;

-- opportunity_documents
ALTER TABLE opportunity_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON opportunity_documents;
CREATE POLICY tenant_isolation_policy ON opportunity_documents
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());
ALTER TABLE opportunity_documents FORCE ROW LEVEL SECURITY;

-- investment_requests
ALTER TABLE investment_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON investment_requests;
CREATE POLICY tenant_isolation_policy ON investment_requests
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());
ALTER TABLE investment_requests FORCE ROW LEVEL SECURITY;

-- payment_instructions
ALTER TABLE payment_instructions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON payment_instructions;
CREATE POLICY tenant_isolation_policy ON payment_instructions
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());
ALTER TABLE payment_instructions FORCE ROW LEVEL SECURITY;

-- holdings
ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON holdings;
CREATE POLICY tenant_isolation_policy ON holdings
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());
ALTER TABLE holdings FORCE ROW LEVEL SECURITY;

-- distributions
ALTER TABLE distributions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON distributions;
CREATE POLICY tenant_isolation_policy ON distributions
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());
ALTER TABLE distributions FORCE ROW LEVEL SECURITY;

-- statements
ALTER TABLE statements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON statements;
CREATE POLICY tenant_isolation_policy ON statements
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());
ALTER TABLE statements FORCE ROW LEVEL SECURITY;

-- content_articles
ALTER TABLE content_articles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON content_articles;
CREATE POLICY tenant_isolation_policy ON content_articles
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());
ALTER TABLE content_articles FORCE ROW LEVEL SECURITY;

-- support_tickets
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON support_tickets;
CREATE POLICY tenant_isolation_policy ON support_tickets
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());
ALTER TABLE support_tickets FORCE ROW LEVEL SECURITY;

-- bank_details
ALTER TABLE bank_details ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON bank_details;
CREATE POLICY tenant_isolation_policy ON bank_details
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());
ALTER TABLE bank_details FORCE ROW LEVEL SECURITY;

-- notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON notifications;
CREATE POLICY tenant_isolation_policy ON notifications
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;

-- transfer_cases
ALTER TABLE transfer_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON transfer_cases;
CREATE POLICY tenant_isolation_policy ON transfer_cases
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());
ALTER TABLE transfer_cases FORCE ROW LEVEL SECURITY;

-- transfer_invitations
ALTER TABLE transfer_invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON transfer_invitations;
CREATE POLICY tenant_isolation_policy ON transfer_invitations
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());
ALTER TABLE transfer_invitations FORCE ROW LEVEL SECURITY;

-- transfer_checklist_items
ALTER TABLE transfer_checklist_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON transfer_checklist_items;
CREATE POLICY tenant_isolation_policy ON transfer_checklist_items
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());
ALTER TABLE transfer_checklist_items FORCE ROW LEVEL SECURITY;

-- priority_notices
ALTER TABLE priority_notices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON priority_notices;
CREATE POLICY tenant_isolation_policy ON priority_notices
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());
ALTER TABLE priority_notices FORCE ROW LEVEL SECURITY;

-- registry_entries
ALTER TABLE registry_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON registry_entries;
CREATE POLICY tenant_isolation_policy ON registry_entries
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());
ALTER TABLE registry_entries FORCE ROW LEVEL SECURITY;

-- token_records
ALTER TABLE token_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON token_records;
CREATE POLICY tenant_isolation_policy ON token_records
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());
ALTER TABLE token_records FORCE ROW LEVEL SECURITY;

-- orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON orders;
CREATE POLICY tenant_isolation_policy ON orders
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());
ALTER TABLE orders FORCE ROW LEVEL SECURITY;

-- trades
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON trades;
CREATE POLICY tenant_isolation_policy ON trades
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());
ALTER TABLE trades FORCE ROW LEVEL SECURITY;

-- settlement_records
ALTER TABLE settlement_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON settlement_records;
CREATE POLICY tenant_isolation_policy ON settlement_records
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());
ALTER TABLE settlement_records FORCE ROW LEVEL SECURITY;

-- liquidity_configs
ALTER TABLE liquidity_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON liquidity_configs;
CREATE POLICY tenant_isolation_policy ON liquidity_configs
  USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id());
ALTER TABLE liquidity_configs FORCE ROW LEVEL SECURITY;
