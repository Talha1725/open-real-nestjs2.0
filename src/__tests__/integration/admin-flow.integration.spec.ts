// Integration test — requires: docker services running, seed data applied, app running on port 3000

import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from '../helpers/api.js';

describe('Admin Operations', () => {
  let adminToken: string;

  beforeAll(async () => {
    adminToken = await loginAs('admin');
  });

  it('GET /admin/dashboard returns KPIs', async () => {
    const { status, data } = await api('GET', '/admin/dashboard', {
      token: adminToken,
    });

    expect(status).toBe(200);
    expect(data.kpis).toBeDefined();
    expect(typeof data.kpis.pendingKyc).toBe('number');
    expect(typeof data.kpis.pendingKyb).toBe('number');
    expect(typeof data.kpis.pendingOpportunities).toBe('number');
    expect(typeof data.kpis.activeRequests).toBe('number');
    expect(typeof data.kpis.totalUsers).toBe('number');
    expect(data.recentActivity).toBeDefined();
  });

  it('GET /admin/users returns user list', async () => {
    const { status, data } = await api('GET', '/admin/users', {
      token: adminToken,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.length).toBeGreaterThanOrEqual(4);
    expect(data.meta).toBeDefined();
  });

  it('GET /admin/kyc returns KYC queue', async () => {
    const { status, data } = await api('GET', '/admin/kyc', {
      token: adminToken,
    });

    expect(status).toBe(200);
    expect(data.data).toBeDefined();
    expect(data.meta).toBeDefined();
  });

  it('GET /admin/kyb returns KYB queue', async () => {
    const { status, data } = await api('GET', '/admin/kyb', {
      token: adminToken,
    });

    expect(status).toBe(200);
    expect(data.data).toBeDefined();
    expect(data.meta).toBeDefined();
  });

  it('GET /admin/opportunities returns opportunity review queue', async () => {
    const { status, data } = await api('GET', '/admin/opportunities', {
      token: adminToken,
    });

    expect(status).toBe(200);
    expect(data.data).toBeDefined();
    expect(data.meta).toBeDefined();
  });

  it('GET /admin/investment-requests returns all requests', async () => {
    const { status, data } = await api('GET', '/admin/investment-requests', {
      token: adminToken,
    });

    expect(status).toBe(200);
    expect(data.data).toBeDefined();
    expect(data.meta).toBeDefined();
  });

  it('GET /admin/audit-logs returns audit events', async () => {
    const { status, data } = await api('GET', '/admin/audit-logs', {
      token: adminToken,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.meta).toBeDefined();
  });

  it('GET /admin/settings returns tenant config', async () => {
    const { status, data } = await api('GET', '/admin/settings', {
      token: adminToken,
    });

    expect(status).toBe(200);
    expect(data.branding).toBeDefined();
    expect(data.legal).toBeDefined();
    expect(data.support).toBeDefined();
    expect(data.features).toBeDefined();
    expect(data.integrations).toBeDefined();
    expect(data.workflows).toBeDefined();
  });

  it('PATCH /admin/settings/branding updates and can be read back', async () => {
    // Update accent color
    const { status: patchStatus, data: patchData } = await api(
      'PATCH',
      '/admin/settings/branding',
      {
        token: adminToken,
        body: { accent: '#FF0000' },
      },
    );

    expect(patchStatus).toBe(200);
    expect(patchData.accent || patchData.colors?.accent).toBeDefined();

    // Read back via settings endpoint
    const { data: settings } = await api('GET', '/admin/settings', {
      token: adminToken,
    });
    const branding = settings.branding;
    expect(branding.accent).toBe('#FF0000');

    // Reset back to original
    await api('PATCH', '/admin/settings/branding', {
      token: adminToken,
      body: { accent: '#4F7BF7' },
    });
  });

  it('GET /admin/reports returns analytics', async () => {
    const { status, data } = await api('GET', '/admin/reports', {
      token: adminToken,
    });

    expect(status).toBe(200);
    expect(data.users).toBeDefined();
    expect(data.users.byRole).toBeDefined();
    expect(data.users.byStatus).toBeDefined();
    expect(data.opportunities).toBeDefined();
    expect(data.investmentRequests).toBeDefined();
  });
});
