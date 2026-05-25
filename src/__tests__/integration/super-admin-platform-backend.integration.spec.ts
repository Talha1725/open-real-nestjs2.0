import { beforeAll, describe, expect, it } from 'vitest';
import { api, loginAs } from '../helpers/api.js';

describe('QA Report - Super admin/platform backend', () => {
  let superAdminToken: string;
  let adminToken: string;
  let openrealTenantId: string;

  beforeAll(async () => {
    superAdminToken = await loginAs('superadmin');
    adminToken = await loginAs('admin');

    const tenants = await api('GET', '/super-admin/tenants', {
      token: superAdminToken,
    });
    expect(tenants.status).toBe(200);
    const openreal = (tenants.data as Array<{ id: string; slug: string }>).find(
      (t) => t.slug === 'openreal',
    );
    expect(openreal).toBeDefined();
    openrealTenantId = openreal!.id;
  }, 70000);

  it('SA-05/SA-06/SA-07: platform health/jobs/logs endpoints', async () => {
    const health = await api('GET', '/super-admin/platform/health', {
      token: superAdminToken,
    });
    expect(health.status).toBe(200);
    expect(health.data.checks.database).toBeDefined();
    expect(health.data.checks.redis).toBeDefined();
    expect(health.data.checks.s3).toBeDefined();

    const jobs = await api('GET', '/super-admin/platform/jobs', {
      token: superAdminToken,
    });
    expect(jobs.status).toBe(200);
    expect(jobs.data).toBeDefined();

    const logs = await api(
      'GET',
      '/super-admin/platform/logs?page=1&limit=10',
      {
        token: superAdminToken,
      },
    );
    expect(logs.status).toBe(200);
    expect(Array.isArray(logs.data.data)).toBe(true);
  });

  it('TEN-03/TEN-06: duplicate slug blocked, resuspend blocked', async () => {
    const slug = `qa-tenant-${Date.now()}`;
    const createOne = await api('POST', '/super-admin/tenants', {
      token: superAdminToken,
      body: {
        name: 'QA Tenant One',
        slug,
        domain: `${slug}.example.test`,
        adminEmail: `${slug}.admin@example.test`,
        adminPassword: 'QaTenantAdmin123!',
        adminName: 'QA Tenant Admin',
        featureTier: 'STARTER',
      },
    });
    expect(createOne.status).toBe(201);
    const tenantId = createOne.data.tenant.id as string;

    const duplicate = await api('POST', '/super-admin/tenants', {
      token: superAdminToken,
      body: {
        name: 'QA Tenant Duplicate',
        slug,
        domain: `${slug}-dup.example.test`,
        adminEmail: `${slug}.dup.admin@example.test`,
        adminPassword: 'QaTenantAdmin123!',
        adminName: 'QA Tenant Admin Duplicate',
        featureTier: 'STARTER',
      },
    });
    expect(duplicate.status).toBe(409);

    const suspend = await api(
      'POST',
      `/super-admin/tenants/${tenantId}/suspend`,
      {
        token: superAdminToken,
      },
    );
    expect(suspend.status).toBe(201);

    const resuspend = await api(
      'POST',
      `/super-admin/tenants/${tenantId}/suspend`,
      {
        token: superAdminToken,
      },
    );
    expect(resuspend.status).toBe(400);

    await api('POST', `/super-admin/tenants/${tenantId}/reactivate`, {
      token: superAdminToken,
    });
  }, 90000);

  it('TEN-11: disabling audit_export feature blocks export endpoint', async () => {
    const disable = await api(
      'PATCH',
      `/super-admin/tenants/${openrealTenantId}/features`,
      {
        token: superAdminToken,
        body: { features: { audit_export: false } },
      },
    );
    expect(disable.status).toBe(200);

    const blocked = await api('POST', '/admin/audit-logs/export', {
      token: adminToken,
      body: { format: 'csv', confirmExport: true },
    });
    expect(blocked.status).toBe(403);

    const enable = await api(
      'PATCH',
      `/super-admin/tenants/${openrealTenantId}/features`,
      {
        token: superAdminToken,
        body: { features: { audit_export: true } },
      },
    );
    expect(enable.status).toBe(200);
  });
});
