// Integration test — requires: docker services running, seed data applied, app running on port 3000

import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from '../helpers/api.js';

describe('Super Admin Operations', () => {
  let superAdminToken: string;
  let openrealTenantId: string;

  beforeAll(async () => {
    superAdminToken = await loginAs('superadmin');

    // Find the OpenReal tenant ID
    const { data: tenants } = await api('GET', '/super-admin/tenants', {
      token: superAdminToken,
    });
    const openreal = tenants.find((t: any) => t.slug === 'openreal');
    openrealTenantId = openreal.id;
  });

  it('should return platform dashboard KPIs', async () => {
    const { status, data } = await api('GET', '/super-admin/dashboard', {
      token: superAdminToken,
    });

    expect(status).toBe(200);
    expect(data.tenants.total).toBeGreaterThanOrEqual(1);
    expect(data.tenants.active).toBeGreaterThanOrEqual(1);
    expect(data.users.total).toBeGreaterThanOrEqual(4);
    expect(data.opportunities).toBeDefined();
    expect(data.investmentRequests).toBeDefined();
  });

  it('should list tenant admins', async () => {
    const { status, data } = await api(
      'GET',
      `/super-admin/tenants/${openrealTenantId}/admins`,
      { token: superAdminToken },
    );

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    // The seeded tenant admin (tenantadmin@openreal.io has role ADMIN)
    // Note: admin@openreal.io is SUPER_ADMIN, not ADMIN, so it won't appear here
  });

  it('should create a new admin for a tenant', async () => {
    const uniqueEmail = `newadmin-${Date.now()}@openreal.test`;
    const { status, data } = await api(
      'POST',
      `/super-admin/tenants/${openrealTenantId}/admins`,
      {
        token: superAdminToken,
        body: {
          email: uniqueEmail,
          fullName: 'New Test Admin',
          password: 'NewAdmin123!',
        },
      },
    );

    expect(status).toBe(201);
    expect(data.email).toBe(uniqueEmail);
    expect(data.role).toBe('ADMIN');
    expect(data.emailVerified).toBe(true);
    expect(data.status).toBe('ACTIVE');
    // Should not return password hash
    expect(data.passwordHash).toBeUndefined();
  });

  it('should return tenant analytics', async () => {
    const { status, data } = await api(
      'GET',
      `/super-admin/tenants/${openrealTenantId}/analytics`,
      { token: superAdminToken },
    );

    expect(status).toBe(200);
    expect(data.tenantId).toBe(openrealTenantId);
    expect(data.tenantName).toBe('OpenReal');
    expect(data.users).toBeDefined();
    expect(data.opportunities).toBeDefined();
    expect(data.investmentRequests).toBeDefined();
    expect(typeof data.holdings).toBe('number');
  });
});
