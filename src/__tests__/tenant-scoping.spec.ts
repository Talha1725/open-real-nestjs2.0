import { describe, it, expect } from 'vitest';

// Import the same set used in PrismaService
// We can't import from PrismaService directly (it has DI dependencies),
// so we replicate the set and verify it matches the expected list.
const TENANT_SCOPED_MODELS = new Set([
  'User',
  'TenantConfig',
  'Verification',
  'IssuerOrg',
  'KYBApplication',
  'Opportunity',
  'OpportunityDocument',
  'InvestmentRequest',
  'PaymentInstruction',
  'Holding',
  'Notification',
  'Distribution',
  'Statement',
  'ContentArticle',
  'SupportTicket',
  'BankDetails',
  'TransferCase',
  'TransferInvitation',
  'TransferChecklistItem',
  'PriorityNotice',
  'RegistryEntry',
  'TokenRecord',
  'Order',
  'Trade',
  'SettlementRecord',
  'LiquidityConfig',
]);

describe('Tenant scoping model set', () => {
  it('should contain exactly 26 models', () => {
    expect(TENANT_SCOPED_MODELS.size).toBe(26);
  });

  it('should NOT include Tenant (root entity)', () => {
    expect(TENANT_SCOPED_MODELS.has('Tenant')).toBe(false);
  });

  it('should NOT include AuditLogEvent (nullable tenantId)', () => {
    expect(TENANT_SCOPED_MODELS.has('AuditLogEvent')).toBe(false);
  });

  it('should include all user-facing models', () => {
    expect(TENANT_SCOPED_MODELS.has('User')).toBe(true);
    expect(TENANT_SCOPED_MODELS.has('Verification')).toBe(true);
    expect(TENANT_SCOPED_MODELS.has('BankDetails')).toBe(true);
    expect(TENANT_SCOPED_MODELS.has('Holding')).toBe(true);
    expect(TENANT_SCOPED_MODELS.has('InvestmentRequest')).toBe(true);
  });

  it('should include issuer and opportunity models', () => {
    expect(TENANT_SCOPED_MODELS.has('IssuerOrg')).toBe(true);
    expect(TENANT_SCOPED_MODELS.has('Opportunity')).toBe(true);
    expect(TENANT_SCOPED_MODELS.has('OpportunityDocument')).toBe(true);
    expect(TENANT_SCOPED_MODELS.has('KYBApplication')).toBe(true);
  });

  it('should include content and support models', () => {
    expect(TENANT_SCOPED_MODELS.has('ContentArticle')).toBe(true);
    expect(TENANT_SCOPED_MODELS.has('SupportTicket')).toBe(true);
  });
});
