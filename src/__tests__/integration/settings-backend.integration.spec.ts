import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from '../helpers/api.js';

const BASE_URL = 'http://localhost:3000/api/v1';

describe('QA Report - Admin settings backend', () => {
  let adminToken: string;
  let superAdminToken: string;
  let openrealTenantId: string;

  beforeAll(async () => {
    adminToken = await loginAs('admin');
    superAdminToken = await loginAs('superadmin');

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

  it('SET-04: logo upload rejects files larger than 2MB', async () => {
    const largeBuffer = Buffer.alloc(2 * 1024 * 1024 + 10, 1);
    const form = new FormData();
    form.append('type', 'primary');
    form.append(
      'file',
      new Blob([largeBuffer], { type: 'image/png' }),
      'too-large.png',
    );

    const res = await fetch(`${BASE_URL}/admin/settings/branding/logo`, {
      method: 'POST',
      headers: {
        'x-tenant-id': 'localhost',
        Authorization: `Bearer ${adminToken}`,
      },
      body: form,
    });

    expect([400, 413]).toContain(res.status);
  });

  it('SET-08: integrations config is encrypted at rest (not plaintext)', async () => {
    const secret = `qa-secret-${Date.now()}`;
    const updated = await api('PATCH', '/admin/settings/integrations', {
      token: adminToken,
      body: {
        kycProvider: 'sumsub',
        kycConfig: {
          apiKey: `qa-key-${Date.now()}`,
          apiSecret: secret,
          webhookSecret: `qa-webhook-${Date.now()}`,
          levelName: 'basic-kyc-level',
        },
      },
    });
    expect(updated.status).toBe(200);

    const tenant = await api(
      'GET',
      `/super-admin/tenants/${openrealTenantId}`,
      {
        token: superAdminToken,
      },
    );
    expect(tenant.status).toBe(200);

    const rawIntegrations = tenant.data?.config?.integrations;
    expect(rawIntegrations).toBeDefined();
    const serialized = JSON.stringify(rawIntegrations);
    expect(serialized.includes(secret)).toBe(false);
  });
});
