// Integration test — requires: docker services running, seed data applied, app running on port 3000

import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from '../helpers/api.js';

describe('Tenant Isolation Integration', () => {
  let superAdminToken: string;
  let newTenantId: string;
  const uniqueSuffix = Date.now();

  beforeAll(async () => {
    superAdminToken = await loginAs('superadmin');

    // Create a second tenant via super admin
    const result = await api('POST', '/super-admin/tenants', {
      token: superAdminToken,
      body: {
        name: 'Test Isolation Tenant',
        slug: `test-isolation-${uniqueSuffix}`,
        domain: `isolation-test-${uniqueSuffix}.example.com`,
        adminEmail: `admin-${uniqueSuffix}@isolation.test`,
        adminName: 'Isolation Admin',
        adminPassword: 'IsoAdmin123!',
        featureTier: 'STARTER',
      },
    });

    expect(result.status).toBe(201);
    newTenantId = result.data.tenant.id;
  });

  it('should create a second tenant successfully', () => {
    expect(newTenantId).toBeDefined();
    expect(typeof newTenantId).toBe('string');
  });

  it('tenant branding returns current tenant data', async () => {
    const { status, data } = await api('GET', '/tenant/branding');

    expect(status).toBe(200);
    expect(data.tenant.name).toBe('OpenReal');
  });

  it('super admin can see both tenants', async () => {
    const { status, data } = await api('GET', '/super-admin/tenants', {
      token: superAdminToken,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(2);

    const slugs = data.map((t: any) => t.slug);
    expect(slugs).toContain('openreal');
    expect(slugs).toContain(`test-isolation-${uniqueSuffix}`);
  });

  it('super admin can view new tenant details', async () => {
    const { status, data } = await api(
      'GET',
      `/super-admin/tenants/${newTenantId}`,
      { token: superAdminToken },
    );

    expect(status).toBe(200);
    expect(data.name).toBe('Test Isolation Tenant');
    expect(data.config).toBeDefined();
    expect(data._counts).toBeDefined();
    expect(data._counts.users).toBe(1); // The admin we created
  });

  it('super admin can update feature flags', async () => {
    const updateResult = await api(
      'PATCH',
      `/super-admin/tenants/${newTenantId}/features`,
      {
        token: superAdminToken,
        body: { features: { issuer_portal: true } },
      },
    );

    expect(updateResult.status).toBe(200);
    expect(updateResult.data.features.issuer_portal).toBe(true);

    // Verify via tenant detail
    const { data } = await api('GET', `/super-admin/tenants/${newTenantId}`, {
      token: superAdminToken,
    });
    expect(data.config.features.issuer_portal).toBe(true);
  });

  it('super admin can suspend and reactivate tenant', async () => {
    // Suspend
    const suspendResult = await api(
      'POST',
      `/super-admin/tenants/${newTenantId}/suspend`,
      { token: superAdminToken },
    );
    expect(suspendResult.status).toBe(201);
    expect(suspendResult.data.tenant.status).toBe('SUSPENDED');

    // Reactivate
    const reactivateResult = await api(
      'POST',
      `/super-admin/tenants/${newTenantId}/reactivate`,
      { token: superAdminToken },
    );
    expect(reactivateResult.status).toBe(201);
    expect(reactivateResult.data.tenant.status).toBe('ACTIVE');
  });
});
