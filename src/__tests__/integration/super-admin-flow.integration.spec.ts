// Integration test — requires: docker services running, seed data applied, app running on port 3000

import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from '../helpers/api.js';

describe('Super Admin Flow', () => {
  let saToken: string;
  let newTenantId: string;

  beforeAll(async () => {
    saToken = await loginAs('superadmin');
  });

  it('GET /super-admin/dashboard returns platform KPIs', async () => {
    const { status, data } = await api('GET', '/super-admin/dashboard', {
      token: saToken,
    });

    expect(status).toBe(200);
    expect(data.tenants).toBeDefined();
    expect(data.users).toBeDefined();
    expect(data.opportunities).toBeDefined();
  });

  it('GET /super-admin/tenants lists tenants', async () => {
    const { status, data } = await api('GET', '/super-admin/tenants', {
      token: saToken,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(1);
    expect(data[0]).toHaveProperty('id');
    expect(data[0]).toHaveProperty('name');
  });

  it('POST /super-admin/tenants creates a new tenant', async () => {
    const slug = `test-${Date.now()}`;
    const { status, data } = await api('POST', '/super-admin/tenants', {
      token: saToken,
      body: {
        name: 'Integration Test Tenant',
        slug,
        domain: `${slug}.test.io`,
        adminEmail: `admin@${slug}.test.io`,
        adminPassword: 'TestAdmin123!',
        adminName: 'Test Tenant Admin',
        featureTier: 'PROFESSIONAL',
      },
    });

    expect(status).toBe(201);
    expect(data.tenant).toBeDefined();
    expect(data.tenant.id).toBeDefined();
    expect(data.tenant.slug).toBe(slug);
    expect(data.adminEmail).toBeDefined();

    newTenantId = data.tenant.id;
  });

  it('GET /super-admin/tenants/:id returns tenant detail', async () => {
    const { status, data } = await api(
      'GET',
      `/super-admin/tenants/${newTenantId}`,
      { token: saToken },
    );

    expect(status).toBe(200);
    expect(data.id).toBe(newTenantId);
    expect(data.name).toBe('Integration Test Tenant');
    expect(data._counts).toBeDefined();
  });

  it('PATCH /super-admin/tenants/:id/features updates feature flags', async () => {
    const { status, data } = await api(
      'PATCH',
      `/super-admin/tenants/${newTenantId}/features`,
      {
        token: saToken,
        body: {
          features: { advanced_analytics: true },
        },
      },
    );

    expect(status).toBe(200);
    expect(data.features.advanced_analytics).toBe(true);
  });
});
